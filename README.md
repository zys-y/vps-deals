# 羊毛情报站

聚合免费 VPS / 优惠福利的 RSS,自动打标签,通过 SSE 实时推送到网页。零依赖,Node 18+。

```
node server.js          # 监听 0.0.0.0:$PORT (默认 8080)
```

环境变量:`PORT`、`POLL_SEC`(抓取间隔秒,默认 300)、`EXTRA_FEEDS`(逗号分隔的额外 RSS 地址)。

接口:`GET /api/deals?tag=&q=&n=`、`GET /api/refresh`、`GET /events`(SSE)。
