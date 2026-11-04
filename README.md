# 行迹 Dotlit

全球旅行足迹地图。中国按市级记录，其他地方按国家和地区记录。支持评分、备注、旅行计划和景点搜索。

## 本地运行

需要 Node.js 22.12+（本项目在 Node.js 24 上验证）和 pnpm 11。

```sh
pnpm install
pnpm dev
```

打开终端打印的 Local URL。默认端口 4310，已被占用时 Vite 自动选择下一个端口。

```sh
pnpm test
pnpm build
pnpm preview
```

构建输出位于 `dist/`，可由普通静态 HTTP 服务提供。应用运行时只读取项目自己的静态资源，无账号、后端、地图密钥、远程地图请求或在线字体。

## 使用与数据

- 世界地图显示国家和地区。点击中国可进入省市地图，点击其他区域可编辑记录。中国的已访城市也会在世界地图上着色。
- 菱形代表精选景点。可按景点名、别名或所属省市搜索，选择结果后地图会放大并定位到景点。
- 去过与计划独立，允许同时存在。去过必须评 1–5 整数星；计划只加图钉。修改后点击保存，未保存内容不会写入。
- 记录保存在当前站点来源的 `localStorage`，键为 `dotlit.travel.v1`。更换浏览器、端口、协议或设备不会自动共享；清理网站数据会删除本地记录。
- **导出数据**：下载含记录、格式版本、地图版本和时间的 JSON，建议定期备份。
- **导入数据**：校验后可预览数量并确认替换。旧版中国备份只替换中国记录。无效文件、未知 ID、重复 ID 和不兼容版本均不写入。
- 浏览器写入失败时保留当前页面内的记录并显示提示，可立即导出备份。JSON 导出使用当前页面内已提交的记录。
- **导出地图**：生成 3200 × 2080 PNG，可选择世界、中国或当前省份。图片保留边界和星级填色，中国地图额外保留省名。

## 地图口径与来源

目前支持 **238 个中国以外的国家和地区、391 个中国记录区域、204 个精选景点**。其中 180 个中国景点覆盖地图中的 34 个省级区域。探索比例按可记录区域数计算，景点用于定位。

全球边界来自 [Natural Earth 1:50m v5.1.2](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/)。景点坐标来自 [Wikidata](https://www.wikidata.org/)，可从景点面板打开对应条目。

边界是历史数据快照，**不声明与当前行政区划完全一致**。地图用于个人足迹展示，不用于测量或导航。

1. [DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector)：大陆及港澳边界、海域线和岛屿。全国文件服务器 Last-Modified 为 2021-06-29；各省为下载时接口返回的历史数据。保留 DataV／上游高德的原始使用条件，本项目未对上游地图数据另行授予许可。
2. [国土测绘中心市县界线](https://data.gov.tw/dataset/7442)：台湾市县；原始下载站点在本次环境不可达，因此使用同源的 [taiwan-atlas](https://github.com/dkaoster/taiwan-atlas) **2021.9.20** 发布镜像。原始数据按政府资料开放授权条款第 1 版提供，转换代码为 MIT，许可保留在 `public/data/taiwan-atlas-LICENSE.txt`。

台湾使用未投影 TWD97 经纬度，按本项目可视化比例与 WGS84 近似处理，不宣称测量精度。金门岛屿从重复的大陆市级几何中移除，每片岛屿只归属一个可记录单元。台湾县市几何中北纬 21 度以南的远海部分不进入县市记录轮廓，全国海域附图来自 DataV。地图通过共同拓扑简化，省界从简化后的市级区域合并生成，避免两套边界错位。

静态资源已随项目提供，正常开发与构建**无需再次下载地图**。来源清单及版本见 `public/data/sources.json`。

需要重新生成数据时：

```sh
pnpm data:prepare
node scripts/prepare-world.mjs
node scripts/prepare-attractions.mjs
```

该脚本需要访问 DataV 与 jsDelivr；原始文件缓存于 `.cache/maps/`。缓存存在时复用；地图升级需同时审阅旧记录 ID 与备份兼容性，不能直接更换 ID 或版本后假定旧数据自动可用。

## 技术

React、TypeScript、Vite、D3 Geo／Zoom／Selection、SVG、浏览器原生 Canvas／File／Blob／localStorage；Vitest 验证记录规则、备份和地理覆盖。Mapshaper 仅用于开发阶段整理边界，运行时不加载。依赖中的 SQLite 等未使用原生扩展已通过 `pnpm-workspace.yaml` 明确禁止构建。
