# CV Research Workflow Agent

基于 LangGraph、Gemini 与 Supabase RAG 的计算机视觉科研实验 Agent。项目设计了一个科研工作台，可统一处理论文、项目资料、模型配置、训练日志和实验指标。

## 核心工作流

### 1. 论文与项目资料问答

- 跨论文、README、项目笔记和模型配置进行语义检索。
- 回答中返回文件、页码和分块来源。
- 按 `projectId` 隔离不同科研项目的知识库。

### 2. 训练日志与实验结果分析

- 支持 LOG、CSV、JSON/JSONL 等常见实验产物。
- 入库时自动提取 loss、accuracy、precision、recall、mAP、FPS、latency、LR 等指标摘要。
- 分析收敛、过拟合、稳定性、效率、异常点与最佳 checkpoint。

### 3. 消融实验规划与配置生成

- 根据论文、模型配置和历史实验构建研究假设。
- 生成正交变量矩阵、控制变量、随机种子、指标与停止条件。
- 输出可下载的 `ablation_plan.yaml`。

## 系统架构

```text
Research Workspace (Next.js)
  ├─ Artifact ingestion API
  │    ├─ PDF page parsing
  │    ├─ Text/config/log chunking
  │    └─ Metric summary extraction
  │
  └─ Research task API
       └─ LangGraph research_graph
            ├─ classifyTask
            ├─ retrieveProjectContext ── Supabase pgvector
            ├─ answerQuestion
            ├─ analyzeExperiments
            └─ planAblation ── YAML artifact

Gemini
  ├─ gemini-3.5-flash
  └─ gemini-embedding-2 (1536 dimensions)
```

后端同时保留 `ingestion_graph` 和旧版 `retrieval_graph`，新工作台默认使用统一的 `research_graph`。图节点会捕获模型、网络和检索异常并返回安全错误结果，避免单次任务异常终止 LangGraph 工作进程。

## 支持的文件

| 类型     | 扩展名                         | 典型用途                                  |
| -------- | ------------------------------ | ----------------------------------------- |
| 论文     | `.pdf`                         | 论文、技术报告、评审意见                  |
| 项目资料 | `.md` `.txt`                   | README、设计说明、研究笔记                |
| 模型配置 | `.yaml` `.yml` `.toml` `.json` | 数据、模型、优化器、训练超参数            |
| 训练日志 | `.log` `.jsonl`                | Epoch/step 日志、验证日志                 |
| 实验指标 | `.csv` `.json`                 | 多实验对比、benchmark、evaluation results |

每次最多上传 10 个文件，单文件不超过 10MB。纯扫描 PDF 需要先执行 OCR。超长日志建议保留相关实验区间或拆分后上传。

## 环境变量

### `backend/.env`

```dotenv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_FALLBACK_CHAT_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=1536
GEMINI_OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
HTTPS_PROXY=

SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=cv-research-agent
```

### `frontend/.env`

```dotenv
NEXT_PUBLIC_LANGGRAPH_API_URL=http://127.0.0.1:2024
LANGGRAPH_INGESTION_ASSISTANT_ID=ingestion_graph
LANGGRAPH_RETRIEVAL_ASSISTANT_ID=retrieval_graph
LANGGRAPH_RESEARCH_ASSISTANT_ID=research_graph
LANGCHAIN_API_KEY=
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=cv-research-agent
```

不要将 `.env` 或 Service Role Key 提交到 Git。

## Supabase 初始化

在 Supabase SQL Editor 中执行：

```text
backend/supabase.sql
```

脚本会创建：

- `documents` 向量表；
- 1536 维 `embedding` 字段；
- `match_documents` 检索函数；
- 用于项目过滤和文件去重的 metadata GIN 索引。

每个分块通过 metadata 保存 `projectId`、`fileHash`、`artifactType`、`filename`、`pageNumber` 和 `chunkIndex`。重复上传同一项目中的相同文件时，新版本写入成功后才会删除旧版本。

## 安装与运行

要求 Node.js 20 与 Yarn 1.x。

```bash
yarn install
```

启动后端：

```bash
cd backend
yarn langgraph:dev
```

启动前端：

```bash
cd frontend
yarn dev
```

访问：

- 科研工作台：http://127.0.0.1:3000
- LangGraph API：http://127.0.0.1:2024
- LangGraph Studio：`https://smith.langchain.com/studio?baseUrl=http://127.0.0.1:2024`

## API

### 入库科研资料

`POST /api/ingest`，`multipart/form-data`：

- `projectId`
- `files`（可重复）

返回资料类型、文件哈希、分块数量与被替换的旧分块数量。

### 执行科研工作流

`POST /api/research`：

```json
{
  "projectId": "cv-research-default",
  "taskMode": "qa",
  "query": "总结模型创新并引用项目证据",
  "threadId": "optional-thread-id"
}
```

`taskMode` 可选 `qa`、`analysis`、`ablation` 或 `auto`。返回 Markdown 研究结果、证据来源和可下载配置文件。

## 验证

```bash
cd backend
yarn build
yarn test

cd ../frontend
yarn build
```

Gemini 连通性：

```bash
cd backend
yarn verify:gemini
```

## 主要目录

```text
backend/src/research_graph/       统一科研任务 LangGraph
backend/src/ingestion_graph/      去重与安全入库图
backend/src/shared/gemini.ts      Gemini 兼容客户端
frontend/lib/artifacts.ts         多类型资料解析和指标摘要
frontend/app/api/research/        科研任务 API
frontend/app/page.tsx             科研工作台
```
