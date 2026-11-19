> **AgiBot GE-Act 2.0：将视频世界预测、逆动力学和世界-动作联合训练分层处理。**

## 三个训练阶段的公开数据量

| 学习阶段 | 时长 | 主要作用 |
|---|---:|---|
| World / Visual Pretraining | **39,000 h** | 学习环境和物体随时间如何变化 |
| Inverse Dynamics Pretraining | **32,000 h** | 学习视觉状态变化与机器人动作的对应 |
| Joint World-Action Training | **30,000 h** | 联合学习视觉未来与动作 |

该研究还讨论了 3,000 小时不含机器人动作标签的人类视频，以及约 2,000 小时失败操作和真实部署数据。**不同阶段的数据池可能交叠，不可简单相加。**

官方资料：[AgiBot GE-Act 2.0 公告](https://www.agibot.com/news/newsroom/agibot-releases-ge-act-2-0-providing-the-120)；[研究项目页面](https://declare-lab.github.io/projects/ge-act-2/)。

## 核心结构

```text
Instruction + Video ──> World Prediction
Robot Trajectories ────> Inverse Dynamics
             \           /
             World-Action Joint Training
                         ↓
                  Robot Action Policy
```

## Scaling Experiment

官方研究报告在 **300、1,200、5,000、30,000h** 等规模上比较模型表现，研究数据规模与任务成功率之间的关系。它是一组特定硬件、任务和测试条件下的 scaling observation，不应直接推导所有机器人任务的统一 Scaling Law。

## 有价值的知识点

**Action-free video 并非不能训练机器人基础模型；关键是目标函数需要匹配数据的监督能力。** 同时，失败轨迹经过正确处理也可以成为价值较高的学习来源。
