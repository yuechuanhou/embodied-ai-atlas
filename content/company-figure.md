> **Figure：通过大规模人类行为视频拓展任务范围，同时使用运动数据、仿真和机器人数据解决整机控制。**

## Index：扩大 Human Behavior Data

Figure 在 **2026-08-25** 公布 Index 数据采集平台，其官方报告包括：

- 超过 **1,600 万**条上传视频；
- 来源覆盖 **100+** 个国家；
- 每秒接收约 **30 分钟视频**（当时公告口径）；
- 通过 filtering、deduplication、distribution rebalancing 和 annotation 建立训练数据处理流程。

**特别注意**：Index 的上传量属于**数据采集平台规模**，不是 Helix 一次训练使用的有效视频总量。参考 [Index 官方公告](https://www.figure.ai/news/introducing-index)。

## Helix 2.5：视频预训练向新家居环境泛化

Figure 在 2026-09-17 的 [Helix 2.5 报告](https://www.figure.ai/news/helix-2-5-zero-shot-30-home-generalization) 中介绍了 Index pretraining 及在 **30 个未见家庭**上的任务评估，并进行了从头训练与预训练的对照。属于公司自报、特定测试设置的结果，不能视作全行业统一基准。

## Helix 02：全身运动的不同数据需求

另一条训练链关注 whole-body controller。Figure 报告：

| 数据/训练方式 | 公开信息 |
|---|---|
| Retargeted human motion | **1,000+ h** |
| Parallel simulation environments | **200,000+** |

这类 joint-level human motion + sim-to-real 训练，与人类日常操作视频对应的学习目标不同。参见 [Helix 02: Full-Body Autonomy](https://www.figure.ai/news/helix-02)。

## 核心理解

同一家公司可以存在多种 recipe：上层视觉任务理解更依赖广泛 Human Video；低层平衡和全身控制更依赖动作轨迹、动力学和仿真；真实机器人数据则继续对齐执行能力。
