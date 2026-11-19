> **NVIDIA GR00T 2：Human Video + UMI + Robot Teleoperation → World-Action Model。**

## 公开的预训练数据

| 类型 | 时长 | 用途直觉 |
|---|---:|---|
| Human egocentric video | **402,730 h** | 广泛的人类操作与物理世界变化 |
| Handheld UMI demonstrations | **10,184 h** | 带操作轨迹的跨任务示范（2,897 个任务） |
| Robot teleoperation | **23,500 h** | 真实机器人动作与 embodiment 对齐 |

这些数字来自 [NVIDIA GEAR 官方 GR00T 2 技术报告](https://research.nvidia.com/labs/gear/gr00t-2/)，属于披露的预训练数据池，并不等于总训练 token 配比。研究中还覆盖不同机器人、夹爪和灵巧手平台。

## 核心技术思路

GR00T 2 使用 **World-Action Model（WAM）**，联合生成未来视觉内容与机器人动作。它尝试让大规模人类视频中的物理交互知识，帮助机器人形成能泛化的行为表征。

```text
Ego Human Video ────┐
UMI Demonstrations ─┼──> World-Action Pretraining
Robot Teleoperation ┘             ↓
                        Adapt to Target Robot
                                  ↓
                         Robot Action Prediction
```

## 如何正确理解实验结果

官方报告通过受控实验分析了人类视频规模对机器人任务表现的影响，并报告在其特定 72 项任务评价中平均任务进度提升。**Task progress 与 Task success rate 并不是同一个指标**，不能据此判断在所有机器人任务上成功率相同。

## 研究意义

- 人类视频提供数据规模和任务多样性。
- UMI 作为人类操作到机器人动作空间的桥梁。
- Robot teleop 为物理可执行动作提供关键约束。
- World-Action 目标将视觉未来与动作训练连接起来。

**仍未知**：完整的所有阶段 mixture 权重、去重规则和目标机器人适配细节。相关背景：[Data Recipe](?page=data-recipe)、[World Model](?page=learning-paradigms)。

官方来源：[GR00T 2 Research](https://research.nvidia.com/labs/gear/gr00t-2/)。
