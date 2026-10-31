// 服务端兜底：从图片头部读出尺寸（不做完整解码），用于限制超大图与记录宽高。
/**
 * @returns {{width:number,height:number,kind:string}|null}
 */
export function imageSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 24) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset);
    return { kind: 'png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { kind: 'gif', width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  // WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    const dv = new DataView(b.buffer, b.byteOffset);
    if (chunk === 'VP8X') return { kind: 'webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (chunk === 'VP8 ') return { kind: 'webp', width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { kind: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG：扫描 SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { kind: 'jpeg', height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * 检查用户上传的图片：尺寸与像素量上限（防"超大图撑爆手机"），并记录宽高。
 * 说明：客户端已重绘去 EXIF；服务端这里无法可靠剥离元数据，
 * 因此额外把"带 EXIF 的位置信息"当作风险提示返回给前端日志。
 */
export function inspectImage(bytes, { maxPixels = 40_000_000, maxSide = 8000 } = {}) {
  const size = imageSize(bytes);
  if (!size || !size.width || !size.height) {
    return { ok: false, reason: '无法识别的图片格式' };
  }
  if (size.width * size.height > maxPixels || size.width > maxSide || size.height > maxSide) {
    return { ok: false, reason: `图片过大（${size.width}×${size.height}），请压缩后再传`, ...size };
  }
  return { ok: true, ...size };
}

/** 粗略检测 JPEG 里是否残留 EXIF（0xE1 APP1 + "Exif"），用于给用户提示 */
export function hasExif(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!(b[0] === 0xff && b[1] === 0xd8)) return false;
  for (let i = 2; i < Math.min(b.length - 6, 65536); i++) {
    if (b[i] === 0xff && b[i + 1] === 0xe1) return true;
  }
  return false;
}
