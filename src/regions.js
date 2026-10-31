// 地域归一：把用户填写的「城市·区」解析成区级锚点。
// 隐私原则：数据库里只存 city / area / 区级锚点经纬度，绝不保存用户坐标或街道信息。

const SEP = /[·・,，、\-–—\s/|]+/;
const AREA_SUFFIX = /(区|县|市|镇|乡|新区)$/;

// 「浦东新区 / 高新区 / 开发区」这类地名本身以"区"结尾，去掉后缀会乱掉，先做保护
const PROTECTED_AREAS = ['浦东新区', '高新技术开发区', '经济技术开发区', '工业园区'];

function stripAreaSuffix(name) {
  if (!name) return '';
  if (PROTECTED_AREAS.includes(name)) return name;
  return name.replace(/(新区|区|县|市|镇|乡)$/, '');
}

// 常见城市的区级锚点（近似中心，精度足够表达"哪个区"）
export const CITY_AREAS = {
  北京: {
    东城区: [116.416, 39.928], 西城区: [116.366, 39.912], 朝阳区: [116.486, 39.948], 海淀区: [116.298, 39.959],
    丰台区: [116.286, 39.858], 石景山区: [116.223, 39.906], 通州区: [116.658, 39.902], 昌平区: [116.231, 40.221],
    大兴区: [116.341, 39.727], 顺义区: [116.654, 40.13],
  },
  上海: {
    黄浦区: [121.484, 31.231], 徐汇区: [121.436, 31.188], 长宁区: [121.424, 31.22], 静安区: [121.448, 31.229],
    普陀区: [121.397, 31.25], 虹口区: [121.505, 31.265], 杨浦区: [121.526, 31.259], 浦东新区: [121.544, 31.221],
    闵行区: [121.381, 31.113], 宝山区: [121.489, 31.405],
  },
  广州: {
    越秀区: [113.267, 23.129], 荔湾区: [113.244, 23.125], 海珠区: [113.317, 23.084], 天河区: [113.361, 23.125],
    白云区: [113.273, 23.158], 黄埔区: [113.459, 23.106], 番禺区: [113.384, 22.938], 花都区: [113.22, 23.403],
  },
  深圳: {
    福田区: [114.055, 22.521], 罗湖区: [114.131, 22.548], 南山区: [113.93, 22.533], 宝安区: [113.883, 22.555],
    龙岗区: [114.246, 22.72], 龙华区: [114.03, 22.697], 盐田区: [114.237, 22.557],
  },
  成都: {
    锦江区: [104.083, 30.657], 青羊区: [104.055, 30.674], 金牛区: [104.052, 30.692], 武侯区: [104.043, 30.642],
    成华区: [104.101, 30.66], 高新区: [104.066, 30.599], 郫都区: [103.901, 30.795],
  },
  杭州: {
    上城区: [120.169, 30.242], 拱墅区: [120.142, 30.319], 西湖区: [120.13, 30.259], 滨江区: [120.212, 30.208],
    萧山区: [120.264, 30.183], 余杭区: [120.299, 30.419],
  },
  南京: {
    玄武区: [118.798, 32.049], 秦淮区: [118.794, 32.039], 鼓楼区: [118.769, 32.066], 建邺区: [118.732, 32.004],
    江宁区: [118.84, 31.953], 栖霞区: [118.909, 32.096],
  },
  武汉: {
    江岸区: [114.303, 30.6], 江汉区: [114.27, 30.601], 武昌区: [114.316, 30.554], 汉阳区: [114.218, 30.554],
    洪山区: [114.343, 30.5], 硚口区: [114.215, 30.582],
  },
  西安: {
    碑林区: [108.934, 34.231], 雁塔区: [108.949, 34.222], 莲湖区: [108.94, 34.267], 新城区: [108.96, 34.266],
    未央区: [108.946, 34.293],
  },
  重庆: {
    渝中区: [106.569, 29.553], 江北区: [106.574, 29.606], 南岸区: [106.563, 29.522], 沙坪坝区: [106.457, 29.541],
    九龙坡区: [106.51, 29.502],
  },
  长沙: { 芙蓉区: [113.032, 28.185], 天心区: [112.989, 28.115], 岳麓区: [112.931, 28.235], 开福区: [112.986, 28.257] },
  郑州: { 金水区: [113.66, 34.8], 二七区: [113.64, 34.723], 中原区: [113.613, 34.748] },
  天津: { 和平区: [117.214, 39.117], 南开区: [117.15, 39.138], 河西区: [117.223, 39.109] },
  苏州: { 姑苏区: [120.62, 31.311], 吴中区: [120.632, 31.262], 工业园区: [120.673, 31.315] },
  青岛: { 市南区: [120.385, 36.075], 市北区: [120.355, 36.088], 崂山区: [120.469, 36.107] },
};

const CITY_CENTER = {};
for (const [city, areas] of Object.entries(CITY_AREAS)) {
  const pts = Object.values(areas);
  CITY_CENTER[city] = [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

export const regionKey = (city, area) => (area ? `${city}·${area}` : city);

/**
 * @returns {{city, area, lat, lng, key, precision}|null}
 */
export function resolveRegion(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 40) return null;
  const parts = raw.split(SEP).filter(Boolean);
  let city = null;
  let area = null;

  for (const p of parts) {
    const hit = Object.keys(CITY_AREAS).find((c) => p.startsWith(c) || p.includes(c));
    if (hit && !city) {
      city = hit;
      const rest = p.slice(p.indexOf(hit) + hit.length).trim();
      if (rest) area = rest;
      continue;
    }
    if (city && !area && AREA_SUFFIX.test(p)) area = p;
  }
  if (!city) {
    const cands = [];
    for (const [c, areas] of Object.entries(CITY_AREAS)) {
      for (const a of Object.keys(areas)) if (raw.includes(a)) cands.push([c, a]);
    }
    if (cands.length === 1) [city, area] = cands[0];
  }
  if (!city) return null;

  const areas = CITY_AREAS[city];
  let key = null;
  if (area) {
    const bare = stripAreaSuffix(area);
    const longest = Object.keys(areas)
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((a) => area.includes(a));
    key =
      Object.keys(areas).find((a) => a === area || area.startsWith(a) || a.startsWith(area)) ||
      longest ||
      (bare.length >= 2 ? Object.keys(areas).find((a) => stripAreaSuffix(a) === bare) : null) ||
      (bare.length >= 2 ? Object.keys(areas).find((a) => a.includes(bare)) : null) ||
      null;
  }
  if (key) {
    const [lng, lat] = areas[key];
    return { city, area: key, lat, lng, key: regionKey(city, key), precision: 'area' };
  }
  const [lng, lat] = CITY_CENTER[city];
  return { city, area: null, lat, lng, key: regionKey(city, null), precision: 'city' };
}

export const cityNames = () => Object.keys(CITY_AREAS);
