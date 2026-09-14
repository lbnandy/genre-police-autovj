// Derived from VJVision viz_controller.cpp by ichiryu, MIT. See upstream.lock.json.
#pragma once
#include "fp/pipeline.h"
#include "fp/align.h"
#include "fp/fp_db.h"
#include "audio/ring_buffer.h"
namespace autovj {
using namespace vj;
constexpr int kMinSliceHashes = 80;
constexpr int kMinAlignedVotes = 10;

// STFT grid phase sweep. DB fingerprints lie on each indexed file's own hop
// grid, but the live ring window opens on an arbitrary sample; a sub-hop
// grid shift drifts spectral peaks and breaks nearly all 80-bit hashes
// (measured: old params 0/19 windows at unlucky phases). Query each window
// on 4 grids offset by 1/4 hop and keep the strongest alignment — worst-case
// distance to the true grid drops from 3/4 hop to 1/8 hop. Every phase
// slice ends at the same "now" sample, so offset normalization is shared.
constexpr int kQueryPhases = 4;

// SQL lookup happens ONCE on the full query; hashes and hits are then
// partitioned in memory by their query offset (frame units) and aligned over
// several tail sub-windows, keeping the strongest. A 12 s (or 6 s) window
// dilutes confidence two ways: during a slow fader blend only the last
// seconds are dominated by the incoming track, and sparse intros contain
// long low-density stretches. A pure tail of such audio aligns far better
// than the whole-window average.
FpResult alignBestTail(const std::vector<Fingerprint>& fps,
                       const std::vector<HashHit>& hits) {
    FpResult best;
    if (fps.empty()) return best;
    int maxOff = 0;
    for (const auto& f : fps) maxOff = (std::max)(maxOff, f.offset);
    const double framesPerSec =
        (double)fp_params::SAMPLE_RATE / fp_params::HOP_SIZE;

    // Tail fractions of the query window; slices shorter than 2 s are too
    // noisy to be meaningful.
    const double tailFracs[] = {1.0, 0.5, 0.35};
    for (double frac : tailFracs) {
        const int cutoff = (int)(maxOff * (1.0 - frac));
        const double sliceSec = (maxOff - cutoff + 1) / framesPerSec;
        if (sliceSec < 2.0) continue;

        std::vector<Fingerprint> slice;
        slice.reserve(fps.size() / 4 + 1);
        for (const auto& f : fps)
            if (f.offset >= cutoff) slice.push_back(f);

        std::vector<HashHit> sliceHits;
        sliceHits.reserve(hits.size() / 4 + 1);
        for (const auto& h : hits)
            if (h.queryOffset >= cutoff) sliceHits.push_back(h);

        FpResult r = alignMatches(slice, sliceHits, (int)slice.size());
        if (!r.matched) continue;
        // Full window is the unguarded baseline; shorter slices must clear
        // both minimum-hash and minimum-aligned-vote gates to override it.
        if (frac < 1.0 && ((int)slice.size() < kMinSliceHashes ||
                           r.alignedVotes < kMinAlignedVotes))
            continue;
        r.sliceSec = sliceSec;
        if (r.inputConfidence > best.inputConfidence) best = r;
    }
    return best;
}

inline FpResult matchLive(FpDb& db, RingBuffer& ring, float peak, bool transitioning, int& transitionTickIdx, double nowSec) {
constexpr float silencePeakThreshold=1e-4f;
constexpr size_t kMaxPhaseOff=fp_params::HOP_SIZE*3/4;
const size_t windowSamples=fp_params::SAMPLE_RATE*(transitioning?6:12);
std::vector<int16_t> i16(windowSamples+kMaxPhaseOff);
size_t fpsCount=0; FpResult result;
            // 4 phase grids at 0/1/2/3 quarter-hop offsets; each phase
            // slice is windowSamples long and ends at the latest sample.
            int phaseOff[kQueryPhases];
            for (int p = 0; p < kQueryPhases; ++p)
                phaseOff[p] = p * fp_params::HOP_SIZE / kQueryPhases;

            const size_t readSamples = windowSamples + kMaxPhaseOff;
            auto snap = ring.readLatest(readSamples);
            // Normalize against the capture block's LOCAL 0.5 s peak (as in
            // 2.0.x): a short window keeps quiet intros/passages loud enough
            // to produce matchable hashes — using the 12 s query window's own
            // peak (2.1.0 attempt) pinned gain low for up to 12 s after any
            // loud passage and made recognition dramatically slower. The 30x
            // (+30 dB) cap stays, so near-silence can no longer amplify the
            // noise floor 100x-1000x into spurious spectral peaks.
            float gain = (std::min)(30.f, 0.95f / peak);
            for (size_t i = 0; i < readSamples; ++i) {
                float v = snap[i] * gain;
                if (v > 1.f) v = 1.f;
                if (v < -1.f) v = -1.f;
                i16[i] = (int16_t)(v * 32767.f);
            }
            // 4-phase baseline scan: extract peaks per phase, generate
            // hashes, keep the strongest alignment. DT_QUANT in the hash
            // makes this robust to keylock-on tempo changes.
            std::vector<Peak> phasePeaks[kQueryPhases];
            const double winSec =
                (double)windowSamples / fp_params::SAMPLE_RATE;
            for (int p = 0; p < kQueryPhases; ++p) {
                int po = phaseOff[p];
                Spectrogram spec = computeSpectrogram(
                    i16.data() + po, windowSamples, fp_params::SAMPLE_RATE);
                phasePeaks[p] = extractPeaks(spec);
                auto fps = generateHashes(phasePeaks[p]);
                fpsCount = (std::max)(fpsCount, fps.size());
                if (fps.empty()) continue;
                auto hits = db.lookupHashes(fps);
                FpResult r = alignBestTail(fps, hits);
                if (!r.matched) continue;
                // Normalize the db/query delta into the invariant mapping
                // between the db file clock and the live clock:
                //   delta = (dbPos - livePos) + windowStart
                // Subtracting windowStart (≈ nowSec - windowSec) makes the
                // value comparable across ticks even as the window slides
                // and across 12 s / 6 s / 3 s-AGC query buffers. All phase
                // slices end on the same sample, so the constant is shared.
                r.offsetSec += winSec - nowSec;
                if (!result.matched ||
                    r.alignedVotes > result.alignedVotes ||
                    (r.alignedVotes == result.alignedVotes &&
                     r.inputConfidence > result.inputConfidence))
                    result = r;
            }

            // --- fader-low AGC tail pass (transitions only) ---
            // Peak extraction uses an ABSOLUTE dB floor and the DB was built
            // from full-scale files; an incoming track whose fader is still
            // low therefore yields far fewer query peaks and its confidence
            // bobs just under the switch gate. Re-fingerprint the last 3 s
            // normalized to THAT tail's own peak (up to 50x); the absolute
            // aligned-vote gate rejects noise-amplified tails.
            if (transitioning) ++transitionTickIdx;
            // 隔拍执行 AGC 尾通道：0.5s 节拍下每 1s 一次，控制 4 相位扫描
            // 的 CPU 增量；对齐票门限仍然拒绝噪声放大的尾段。
            if (transitioning && (transitionTickIdx % 2 == 0)) {
                constexpr size_t kAgcSamples = (size_t)fp_params::SAMPLE_RATE * 3;
                auto tail = ring.readLatest(kAgcSamples + kMaxPhaseOff);
                float tailPeak = 0.f;
                for (float s : tail) {
                    float a = s < 0.f ? -s : s;
                    if (a > tailPeak) tailPeak = a;
                }
                if (tailPeak >= silencePeakThreshold) {
                    float tailGain = (std::min)(50.f, 0.95f / tailPeak);
                    std::vector<int16_t> t16(kAgcSamples + kMaxPhaseOff);
                    for (size_t i = 0; i < t16.size(); ++i) {
                        float v = tail[i] * tailGain;
                        if (v > 1.f) v = 1.f;
                        if (v < -1.f) v = -1.f;
                        t16[i] = (int16_t)(v * 32767.f);
                    }
                    for (int po : phaseOff) {
                        Spectrogram spec = computeSpectrogram(
                            t16.data() + po, kAgcSamples,
                            fp_params::SAMPLE_RATE);
                        auto tpeaks = extractPeaks(spec);
                        auto tfps = generateHashes(tpeaks);
                        if ((int)tfps.size() < kMinSliceHashes) continue;
                        auto thits = db.lookupHashes(tfps);
                        FpResult tr = alignMatches(tfps, thits, (int)tfps.size());
                        if (tr.matched && tr.alignedVotes >= kMinAlignedVotes) {
                            tr.sliceSec = 3.0;
                            tr.localAgc = true;
                            // Same clock normalization as the main pass; this
                            // buffer covers the last 3 s for every phase.
                            tr.offsetSec += 3.0 - nowSec;
                            if (tr.inputConfidence > result.inputConfidence)
                                result = tr;
                        }
                    }
                }
            }
return result;
}
}
