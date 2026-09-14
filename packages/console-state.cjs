"use strict";
// Library-sized work is performed only after a library write, never for meters.
class ConsoleState {
  constructor() { this.resetDelivery(); }
  libraryView(library) {
    if (this.owner !== library || this.revision !== library.revision || this.data !== library.data) {
      this.owner = library; this.revision = library.revision; this.data = library.data;
      const tracks = library.data.tracks.map(t => library.publicTrack(t));
      this.tracks = new Map(tracks.map(t => [t.id, t]));
      this.view = {id:library.data.libraryId, name:library.data.name || 'My library',
        djName:library.data.djName, revision:library.revision, tracks, themes:library.themes()};
    }
    return this.view;
  }
  resetDelivery() { this.sentLibrary = this.sentLibraries = null; }
  delta(state) {
    const result = {...state};
    if (state.library === this.sentLibrary) delete result.library;
    if (state.libraries === this.sentLibraries) delete result.libraries;
    this.sentLibrary = state.library; this.sentLibraries = state.libraries;
    return result;
  }
}
module.exports = {ConsoleState};
