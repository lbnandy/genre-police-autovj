"use strict";
function validateLogo(value) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > 3 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid DJ logo");
  const bytes = Buffer.from(value.split(",")[1], "base64");
  if (bytes.length < 24 || bytes.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) > 2048 || bytes.readUInt32BE(20) > 2048) throw new Error("Invalid DJ logo");
  return value;
}
function logoScale(value) { const n=Number(value); return Number.isFinite(n) && n > 0 ? Math.max(0.5,Math.min(1.5,n)) : 1; }
module.exports={validateLogo,logoScale};
