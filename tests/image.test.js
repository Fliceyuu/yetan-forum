// 图片尺寸解析 + 服务端兜底校验（防超大图、记录宽高）
process.env.DB_PATH = 'data/test-image.db';
process.env.UPLOAD_DIR = 'uploads-test';

const { inspectImage, imageSize, hasExif } = await import('../src/image-meta.js');
const { db, migrate, upgrade } = await import('../src/db.js');
migrate();
upgrade();

/** 造一张指定尺寸的 PNG（仅头部合法，足够给 imageSize 读） */
function fakePng(w, h) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[24] = 8;
  b[25] = 6;
  return b;
}

describe('图片元数据与尺寸兜底', () => {
  test('能读出 PNG 宽高', () => {
    const s = imageSize(fakePng(1200, 800));
    expect(s).toMatchObject({ kind: 'png', width: 1200, height: 800 });
  });

  test('能读出 JPEG 宽高', () => {
    // SOI + APP0 + SOF0(高 600 / 宽 800)
    const b = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    const s = imageSize(b);
    expect(s.kind).toBe('jpeg');
    expect(s.width).toBe(800);
    expect(s.height).toBe(600);
  });

  test('超大图被拒绝（像素量与单边双重限制）', () => {
    const huge = inspectImage(fakePng(9000, 9000));
    expect(huge.ok).toBe(false);
    expect(huge.reason).toContain('过大');
    const fine = inspectImage(fakePng(1600, 1200));
    expect(fine.ok).toBe(true);
    expect(fine.width).toBe(1600);
  });

  test('无法识别的图片被拒绝', async () => {
    const r = inspectImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]));
    expect(r.ok).toBe(false);
  });

  test('能识别 JPEG 里残留的 EXIF（用于提示用户）', () => {
    const withExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    expect(hasExif(withExif)).toBe(true);
    expect(hasExif(fakePng(10, 10))).toBe(false);
  });

  test('附件表有宽高列（前端可用来留位，避免布局跳动）', () => {
    const cols = db.query('PRAGMA table_info(attachments)').all().map((c) => c.name);
    expect(cols).toContain('width');
    expect(cols).toContain('height');
  });
});
