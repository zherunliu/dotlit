import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Curated English Wikipedia titles and Wikidata IDs resolve to coordinate records.
const entries = [
  ['埃菲尔铁塔', 'Eiffel Tower', 'world:FRA', '巴黎'],
  ['卢浮宫', 'Louvre', 'world:FRA', '巴黎'],
  ['大本钟', 'Big Ben', 'world:GBR', '伦敦'],
  ['罗马斗兽场', 'Colosseum', 'world:ITA', '罗马', '罗马竞技场'],
  ['圣家堂', 'Sagrada Família', 'world:ESP', '巴塞罗那'],
  ['雅典卫城', 'Acropolis of Athens', 'world:GRC'],
  ['勃兰登堡门', 'Brandenburg Gate', 'world:DEU', '柏林'],
  [
    '圣瓦西里主教座堂',
    "Saint Basil's Cathedral",
    'world:RUS',
    '红场',
    '莫斯科',
  ],
  ['自由女神像', 'Statue of Liberty', 'world:USA', '纽约'],
  [
    '大峡谷国家公园',
    'Grand Canyon National Park',
    'world:USA',
    '科罗拉多大峡谷',
  ],
  ['尼亚加拉瀑布', 'Niagara Falls', 'world:CAN', 'Niagara'],
  ['奇琴伊察', 'Chichen Itza', 'world:MEX'],
  ['马丘比丘', 'Machu Picchu', 'world:PER'],
  [
    '里约热内卢基督像',
    'Christ the Redeemer (statue)',
    'world:BRA',
    '基督救世主像',
    '里约',
  ],
  ['吉萨金字塔', 'Giza pyramid complex', 'world:EGY', '埃及金字塔', '开罗'],
  ['桌山', 'Table Mountain', 'world:ZAF', '开普敦'],
  ['泰姬陵', 'Taj Mahal', 'world:IND', '阿格拉'],
  ['吴哥窟', 'Angkor Wat', 'world:KHM', '暹粒'],
  ['富士山', 'Mount Fuji', 'world:JPN', '富士'],
  ['景福宫', 'Gyeongbokgung', 'world:KOR', '首尔'],
  ['新加坡滨海湾花园', 'Gardens by the Bay', 'world:SGP', '滨海湾花园'],
  ['悉尼歌剧院', 'Sydney Opera House', 'world:AUS', '悉尼'],
  ['米尔福德峡湾', 'Milford Sound', 'world:NZL'],
  ['圣索菲亚大教堂', 'Hagia Sophia', 'world:TUR', '伊斯坦布尔'],
  ['故宫', 'Forbidden City', 'cn:110000', '紫禁城', '北京故宫'],
  ['八达岭长城', 'Badaling', 'cn:110000', '万里长城', 'Great Wall'],
  ['外滩', 'The Bund', 'cn:310000', '上海外滩'],
  ['杭州西湖', 'West Lake', 'cn:330100', '西湖'],
  [
    '苏州拙政园',
    "Humble Administrator's Garden",
    'cn:320500',
    '拙政园',
    '苏州园林',
  ],
  ['秦始皇兵马俑', 'Terracotta Army', 'cn:610100', '兵马俑', '西安'],
  ['布达拉宫', 'Potala Palace', 'cn:540100', '拉萨'],
  ['九寨沟', 'Jiuzhaigou', 'cn:513200'],
  ['乐山大佛', 'Leshan Giant Buddha', 'cn:511100'],
  [
    '张家界国家森林公园',
    'Zhangjiajie National Forest Park',
    'cn:430800',
    '张家界',
  ],
  ['太平山顶', 'Victoria Peak', 'cn:810000', '香港太平山'],
  ['澳门大三巴牌坊', "Ruins of Saint Paul's", 'cn:820000', '大三巴'],
  ['台北 101', 'Taipei 101', 'tw:63000', '台北101'],
  ['天坛', 'Temple of Heaven', 'cn:110000'],
  ['颐和园', 'Summer Palace', 'cn:110000'],
  ['天津之眼', 'Tianjin Eye', 'cn:120000', '永乐桥摩天轮'],
  ['承德避暑山庄', 'Chengde Mountain Resort', 'cn:130800', '避暑山庄'],
  ['山海关', 'Shanhai Pass', 'cn:130300', '天下第一关'],
  ['云冈石窟', 'Yungang Grottoes', 'cn:140200', '大同云冈'],
  ['悬空寺', 'Hanging Temple', 'cn:140200', '恒山悬空寺'],
  ['五台山', 'Mount Wutai', 'cn:140900'],
  ['成吉思汗陵', 'Mausoleum of Genghis Khan', 'cn:150600', '成陵'],
  ['元上都遗址', 'Shangdu', 'cn:152500', '元上都'],
  ['沈阳故宫', 'Mukden Palace', 'cn:210100', '盛京皇宫'],
  ['大连星海广场', 'Xinghai Square', 'cn:210200', '星海广场'],
  [
    '伪满皇宫博物院',
    'Museum of the Imperial Palace of Manchukuo',
    'cn:220100',
    '长春伪满皇宫',
  ],
  [
    '哈尔滨圣索菲亚教堂',
    'Saint Sophia Cathedral, Harbin',
    'cn:230100',
    '索菲亚教堂',
  ],
  ['东方明珠广播电视塔', 'Oriental Pearl Tower', 'cn:310000', '东方明珠'],
  ['上海豫园', 'Yu Garden', 'cn:310000', '豫园'],
  ['中山陵', 'Sun Yat-sen Mausoleum', 'cn:320100', '南京中山陵'],
  ['扬州瘦西湖', 'Slender West Lake', 'cn:321000', '瘦西湖'],
  ['乌镇', 'Wuzhen', 'cn:330400'],
  ['灵隐寺', 'Lingyin Temple', 'cn:330100'],
  ['普陀山', 'Mount Putuo', 'cn:330900'],
  ['黄山', 'Huangshan', 'cn:341000'],
  ['宏村', 'Hongcun', 'cn:341000'],
  ['鼓浪屿', 'Gulangyu', 'cn:350200', '厦门鼓浪屿'],
  [
    '田螺坑土楼群',
    'Tianluokeng Tulou cluster',
    'cn:350600',
    '福建土楼',
    '南靖土楼',
  ],
  ['武夷山', 'Wuyi Mountains', 'cn:350700'],
  ['庐山', 'Mount Lu', 'cn:360400'],
  ['滕王阁', 'Pavilion of Prince Teng', 'cn:360100'],
  ['三清山', 'Mount Sanqing', 'cn:361100'],
  ['泰山', 'Mount Tai', 'cn:370900'],
  ['曲阜孔庙', 'Temple of Confucius, Qufu', 'cn:370800', '曲阜三孔'],
  ['龙门石窟', 'Longmen Grottoes', 'cn:410300'],
  ['少林寺', 'Shaolin Monastery', 'cn:410100', '嵩山少林寺'],
  ['黄鹤楼', 'Yellow Crane Tower', 'cn:420100'],
  ['武当山', 'Wudang Mountains', 'cn:420300'],
  ['岳阳楼', 'Yueyang Tower', 'cn:430600'],
  ['广州塔', 'Canton Tower', 'cn:440100', '小蛮腰'],
  ['陈家祠', 'Chen Clan Ancestral Hall', 'cn:440100', '陈氏书院'],
  ['桂林象鼻山', 'Elephant Trunk Hill', 'cn:450300', '象山'],
  ['芦笛岩', 'Reed Flute Cave', 'cn:450300'],
  ['天涯海角', 'Tianya Haijiao', 'cn:460200'],
  ['三亚南山寺', 'Nanshan Temple (Sanya)', 'cn:460200', '南山文化旅游区'],
  ['大足石刻', 'Dazu Rock Carvings', 'cn:500000'],
  ['重庆洪崖洞', 'Hongya Cave', 'cn:500000', '洪崖洞'],
  [
    '成都大熊猫繁育研究基地',
    'Chengdu Research Base of Giant Panda Breeding',
    'cn:510100',
    '成都熊猫基地',
    '熊猫基地',
  ],
  ['都江堰', 'Dujiangyan', 'cn:510100'],
  ['峨眉山', 'Mount Emei', 'cn:511100'],
  ['黄果树瀑布', 'Huangguoshu Waterfall', 'cn:520400', '黄果树'],
  ['梵净山', 'Fanjingshan', 'cn:520600'],
  ['丽江古城', 'Old Town of Lijiang', 'cn:530700', '大研古城'],
  ['云南石林', 'Stone Forest', 'cn:530100', '石林风景区'],
  ['崇圣寺三塔', 'Three Pagodas', 'cn:532900', '大理三塔'],
  ['玉龙雪山', 'Jade Dragon Snow Mountain', 'cn:530700'],
  ['大昭寺', 'Jokhang', 'cn:540100'],
  ['大雁塔', 'Giant Wild Goose Pagoda', 'cn:610100', '西安大雁塔'],
  ['华山', 'Mount Hua', 'cn:610500'],
  ['敦煌莫高窟', 'Mogao Caves', 'cn:620900', '莫高窟', '千佛洞'],
  [
    '张掖七彩丹霞',
    'Zhangye National Geopark',
    'cn:620700',
    '张掖丹霞',
    '七彩丹霞',
  ],
  ['嘉峪关关城', 'Jiayu Pass', 'cn:620200', '嘉峪关'],
  ['塔尔寺', 'Kumbum Monastery', 'cn:630100'],
  ['茶卡盐湖', 'Chaka Salt Lake', 'cn:632800', '天空之镜'],
  ['西夏陵', 'Western Xia mausoleums', 'cn:640100', '西夏王陵'],
  ['交河故城', 'Jiaohe ruins', 'cn:650400', '吐鲁番交河故城'],
  ['喀纳斯湖', 'Kanas Lake', 'cn:654300', '喀纳斯'],
  ['艾提尕尔清真寺', 'Id Kah Mosque', 'cn:653100', '喀什艾提尕尔'],
  ['天坛大佛', 'The Big Buddha (Hong Kong)', 'cn:810000', '昂坪大佛'],
  ['香港迪士尼乐园', 'Hong Kong Disneyland', 'cn:810000', '香港迪士尼'],
  ['澳门议事亭前地', 'Senado Square', 'cn:820000', '议事亭前地', '喷水池广场'],
  ['澳门妈阁庙', 'A-Ma Temple', 'cn:820000', '妈阁庙'],
  ['台北故宫博物院', 'National Palace Museum', 'tw:63000', '台北故宫'],
  ['日月潭', 'Sun Moon Lake', 'tw:10008'],
  ['太鲁阁', 'Taroko National Park', 'tw:10015', '太鲁阁国家公园'],
  ['长白山天池', 'Heaven Lake', 'cn:220600', '长白山', '天池'],
  ['赵州桥', 'Anji Bridge', 'cn:130100', '安济桥'],
  ['青岛栈桥', 'Zhanqiao Pier', 'cn:370200', '栈桥'],
  ['平遥古城', 'Pingyao', 'cn:140700', '平遥'],
  ['雍和宫', 'Yonghe Temple', 'cn:110000'],
  ['北京鸟巢', 'Beijing National Stadium', 'cn:110000', '国家体育场'],
  ['天津广播电视塔', 'Tianjin Radio and Television Tower', 'cn:120000', '天塔'],
  ['天津博物馆', 'Tianjin Museum', 'cn:120000'],
  ['天津滨海图书馆', 'Tianjin Binhai Library', 'cn:120000', '滨海新区图书馆'],
  ['清东陵', 'Eastern Qing tombs', 'cn:130200', '遵化清东陵'],
  ['清西陵', 'Western Qing tombs', 'cn:130600', '易县清西陵'],
  ['晋祠', 'Jinci', 'cn:140100', '太原晋祠'],
  ['乔家大院', 'Qiao Family Compound', 'cn:140700'],
  ['呼伦湖', 'Hulun Lake', 'cn:150700', '达赉湖'],
  ['沈阳北陵公园', 'Beiling Park', 'cn:210100', '清昭陵'],
  ['辽宁省博物馆', 'Liaoning Provincial Museum', 'cn:210100', '辽博'],
  ['松花湖', 'Q837876', 'cn:220200', '吉林松花湖'],
  ['长春世界雕塑园', 'Changchun World Sculpture Park', 'cn:220100'],
  ['镜泊湖', 'Jingpo Lake', 'cn:231000', '牡丹江镜泊湖'],
  ['哈尔滨冰雪大世界', 'Q10895490', 'cn:230100', '冰雪大世界'],
  ['上海中心大厦', 'Shanghai Tower', 'cn:310000', '上海中心'],
  ['上海博物馆', 'Shanghai Museum', 'cn:310000', '上博'],
  ['朱家角古镇', 'Zhujiajiao', 'cn:310000', '朱家角'],
  ['苏州留园', 'Lingering Garden', 'cn:320500', '留园'],
  ['苏州虎丘', 'Tiger Hill, Suzhou', 'cn:320500', '虎丘'],
  ['南京博物院', 'Nanjing Museum', 'cn:320100', '南博'],
  ['南京总统府', 'Presidential Palace (Nanjing)', 'cn:320100'],
  ['雷峰塔', 'Leifeng Pagoda', 'cn:330100'],
  ['千岛湖', 'Qiandao Lake', 'cn:330100', '新安江水库'],
  ['宁波天一阁', 'Tianyi Ge', 'cn:330200', '天一阁'],
  ['莫干山', 'Mount Mogan', 'cn:330500'],
  ['西递', 'Xidi', 'cn:341000', '黟县西递'],
  ['九华山', 'Mount Jiuhua', 'cn:341700'],
  ['泉州开元寺', 'Kaiyuan Temple (Quanzhou)', 'cn:350500', '开元寺'],
  ['洛阳桥', 'Luoyang Bridge', 'cn:350500', '泉州洛阳桥'],
  ['厦门胡里山炮台', 'Q15903382', 'cn:350200', '胡里山炮台'],
  ['福州三坊七巷', 'Sanfang Qixiang', 'cn:350100', '三坊七巷'],
  ['龙虎山', 'Mount Longhu', 'cn:360600', '鹰潭龙虎山'],
  ['井冈山', 'Jinggang Mountains', 'cn:360800'],
  ['趵突泉', 'Baotu Spring', 'cn:370100', '济南趵突泉'],
  ['大明湖', 'Daming Lake', 'cn:370100'],
  ['蓬莱阁', 'Penglai Pavilion', 'cn:370600'],
  ['殷墟', 'Yinxu', 'cn:410500', '安阳殷墟'],
  ['河南博物院', 'Henan Museum', 'cn:410100', '河南博物馆'],
  ['洛阳白马寺', 'White Horse Temple', 'cn:410300', '白马寺'],
  ['湖北省博物馆', 'Hubei Provincial Museum', 'cn:420100', '鄂博'],
  ['三峡大坝', 'Three Gorges Dam', 'cn:420500', '宜昌三峡大坝'],
  ['橘子洲', 'Orange Isle', 'cn:430100', '橘子洲头'],
  ['岳麓书院', 'Yuelu Academy', 'cn:430100'],
  ['南岳衡山', 'Mount Heng (Hunan)', 'cn:430400', '衡山'],
  ['深圳世界之窗', 'Window of the World', 'cn:440300', '世界之窗'],
  ['广州沙面', 'Shamian', 'cn:440100', '沙面岛'],
  ['佛山祖庙', 'Foshan Ancestral Temple', 'cn:440600', '祖庙'],
  ['龙脊梯田', 'Longsheng Rice Terraces', 'cn:450300', '龙胜梯田'],
  ['南宁青秀山', 'Q24837771', 'cn:450100', '青秀山'],
  ['三亚蜈支洲岛', 'Wuzhizhou Island', 'cn:460200', '蜈支洲岛'],
  ['海口五公祠', 'Temple of the Five Lords', 'cn:460100', '五公祠'],
  ['重庆磁器口', 'Ciqikou, Chongqing', 'cn:500000', '磁器口古镇'],
  ['武隆天生三桥', 'Three Natural Bridges', 'cn:500000', '天生三桥', '武隆'],
  ['重庆中国三峡博物馆', 'Three Gorges Museum', 'cn:500000', '三峡博物馆'],
  ['三星堆', 'Sanxingdui', 'cn:510600', '广汉三星堆'],
  ['青城山', 'Mount Qingcheng', 'cn:510100'],
  [
    '黄龙风景名胜区',
    'Huanglong Scenic and Historic Interest Area',
    'cn:513200',
    '黄龙',
  ],
  ['织金洞', 'Zhijin Cave', 'cn:520500'],
  ['西江千户苗寨', 'Q17067051', 'cn:522600', '西江苗寨', '千户苗寨'],
  ['洱海', 'Erhai Lake', 'cn:532900', '大理洱海'],
  ['滇池', 'Dian Lake', 'cn:530100', '昆明滇池'],
  ['罗布林卡', 'Norbulingka', 'cn:540100'],
  ['羊卓雍措', 'Yamdrok Lake', 'cn:540500', '羊湖'],
  ['扎什伦布寺', 'Tashi Lhunpo Monastery', 'cn:540200', '日喀则扎寺'],
  ['西安城墙', "Fortifications of Xi'an", 'cn:610100', '明城墙'],
  ['西安钟楼', "Bell Tower of Xi'an", 'cn:610100', '钟楼'],
  ['华清宫', 'Huaqing Pool', 'cn:610100', '华清池'],
  ['麦积山石窟', 'Maijishan Grottoes', 'cn:620500', '麦积山'],
  ['拉卜楞寺', 'Labrang Monastery', 'cn:623000', '夏河拉卜楞寺'],
  ['炳灵寺石窟', 'Bingling Temple', 'cn:622900', '炳灵寺'],
  ['西宁东关清真大寺', 'Dongguan Mosque', 'cn:630100', '东关清真寺'],
  ['青海湖', 'Qinghai Lake', 'cn:632200', '措温布'],
  ['海宝塔', 'Haibao Pagoda Temple', 'cn:640100', '海宝塔寺', '北塔'],
  [
    '青铜峡一百零八塔',
    'One Hundred and Eight Stupas',
    'cn:640300',
    '一百零八塔',
    '108塔',
  ],
  ['天山天池', 'Heavenly Lake of Tian Shan', 'cn:652300', '天池'],
  ['克孜尔石窟', 'Kizil Caves', 'cn:652900', '克孜尔千佛洞'],
  ['吐鲁番火焰山', 'Flaming Mountains', 'cn:650400', '火焰山'],
  ['苏公塔', 'Emin Minaret', 'cn:650400', '额敏塔'],
  ['香港海洋公园', 'Ocean Park Hong Kong', 'cn:810000', '海洋公园'],
  ['澳门旅游塔', 'Macau Tower', 'cn:820000', '澳门塔'],
  ['澳门东望洋炮台', 'Guia Fortress', 'cn:820000', '东望洋灯塔', '松山炮台'],
  ['台北龙山寺', 'Longshan Temple (Taipei)', 'tw:63000', '艋舺龙山寺'],
  ['高雄佛光山佛陀纪念馆', 'Fo Guang Shan Buddha Museum', 'tw:64000', '佛光山'],
  ['台南安平古堡', 'Fort Zeelandia (Taiwan)', 'tw:67000', '热兰遮城'],
  ['阿里山国家风景区', 'Alishan National Scenic Area', 'tw:10010', '阿里山'],
  ['凤凰古城', 'Q132776323', 'cn:433100', '凤凰'],
  ['开平碉楼', 'Q16303641', 'cn:440700'],
  ['贺兰山岩画', 'Rock Paintings of Helan Mountains', 'cn:640100'],
  ['承天寺塔', 'Pagoda of Chengtian Temple', 'cn:640100', '西塔'],
];

const china = JSON.parse(await readFile('public/data/china.json', 'utf8'));
const world = JSON.parse(await readFile('public/data/world.json', 'utf8'));
const regionIds = new Set(
  [...china.regions.features, ...world.regions.features].map(
    (f) => f.properties.id,
  ),
);
const data = [];
const missing = [];
const isEntityId = (reference) => /^Q\d+$/.test(reference);
const batches = [];
for (const byId of [false, true]) {
  const group = entries.filter(
    ([, reference]) => isEntityId(reference) === byId,
  );
  for (let i = 0; i < group.length; i += 10)
    batches.push(group.slice(i, i + 10));
}
await mkdir('.cache/maps/attractions', { recursive: true });
for (const batch of batches) {
  const byId = isEntityId(batch[0][1]);
  const references = batch.map(([, reference]) => reference).join('|');
  const query = new URLSearchParams({
    action: 'wbgetentities',
    ...(byId ? { ids: references } : { sites: 'enwiki', titles: references }),
    props: 'claims|sitelinks|labels',
    sitefilter: 'enwiki',
    languages: 'en|zh|zh-hans',
    redirects: 'yes',
    format: 'json',
  });
  const key = createHash('sha256').update(String(query)).digest('hex');
  const cache = `.cache/maps/attractions/${key}.json`;
  let body;
  try {
    body = await readFile(cache, 'utf8');
  } catch {
    body = execFileSync(
      'curl',
      [
        '-fLsS',
        '--compressed',
        '--user-agent',
        'Dotlit map data preparation (https://github.com/zherunliu/dotlit)',
        '--max-time',
        '45',
        `https://www.wikidata.org/w/api.php?${query}`,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
  }
  const result = JSON.parse(body);
  if (result.error) throw new Error(result.error.info);
  await writeFile(cache, body);
  const entities = Object.values(result.entities ?? {});
  for (const [name, reference, regionId, ...aliases] of batch) {
    const entity = entities.find((item) =>
      byId
        ? item.id === reference
        : item.sitelinks?.enwiki?.title === reference,
    );
    const claim =
      entity?.claims?.P625?.find((claim) => claim.rank === 'preferred') ??
      entity?.claims?.P625?.[0];
    const value = claim?.mainsnak?.datavalue?.value;
    if (!value || !regionIds.has(regionId)) {
      missing.push(`${reference} (${regionId})`);
      continue;
    }
    data.push({
      id: entity.id,
      name,
      aliases: [
        ...new Set(
          [
            entity.sitelinks?.enwiki?.title,
            entity.labels?.en?.value,
            entity.labels?.['zh-hans']?.value,
            ...aliases,
          ].filter((alias) => alias && alias !== name),
        ),
      ],
      regionId,
      coordinates: [value.longitude, value.latitude],
      source: `https://www.wikidata.org/wiki/${entity.id}`,
    });
  }
}
if (missing.length)
  throw new Error(`Missing coordinates or region: ${missing.join(', ')}`);
if (new Set(data.map(({ id }) => id)).size !== data.length)
  throw new Error('Duplicate attraction IDs.');
await mkdir('src/data', { recursive: true });
await writeFile(
  'src/data/attractions.json',
  JSON.stringify(data, null, 2) + '\n',
);
console.log(`Prepared ${data.length} attractions.`);
