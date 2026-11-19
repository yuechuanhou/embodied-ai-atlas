> **不是哪一种数据“最好”，而是“哪一种数据最适合当前要训练的能力”。**

## 横向对比

下面是典型工程条件下的定性判断，不代表所有公司、硬件或任务必然适用。

| 数据来源 | 机器人原生 Action | 单位数据成本 | 可扩展性 | 典型瓶颈 |
|---|---|---|---|---|
| 真实机器人遥操 | 是 | 高 | 较弱 | 操作员、硬件和环境 |
| 自主机器人 Rollout | 是 | 中至高 | 中 | 当前策略性能、安全性 |
| 普通人类视频 | 通常没有 | 低至中 | 很强 | Action 缺失、形态差距 |
| UMI / 动捕示范 | 可转换 | 中 | 较强 | Retargeting、传感器精度 |
| 物理仿真 | 是 | 初期成本高、边际成本低 | 很强 | Sim-to-Real Gap |
| 生成式合成数据 | 视方法而定 | 可较低 | 很强 | 真实性、动作可执行性 |

## 不同训练目标对应什么数据？

| 训练目标 | 优先考虑的数据 | 原因 |
|---|---|---|
| 视觉语义和任务知识 | Web / Ego Human Video | 覆盖更多物体、环境、操作过程 |
| 目标机器人稳定模仿 | Teleoperation / Robot Demonstration | 真实的 observation–action 配对 |
| 跨机器人通用操作 | Multi-Robot + UMI + Robot Data | 多 embodiment 共性和适配能力 |
| 运动技能与接触策略 | Real-Robot + Simulation | 需要动作、状态和动力学信息 |
| 失败恢复和安全行为 | On-policy Rollout + Intervention | 直接覆盖部署时失效分布 |
| 世界动态预测 | Video + Action-conditioned Interaction | 学习状态随时间和动作变化的规律 |

## 为什么百万小时视频不能直接替代遥操？

普通视频可能显示某个人抓起杯子，但未记录机器人具体应执行的 `q1...q6` 或末端运动指令。人类身体和机器人形态不同，机器人想复现操作，还需推断动作、跨形态映射或通过目标机器人数据适配。

换句话说：**Human Video 擅长教“发生了什么以及为什么”，Robot Demonstration 更直接教“具体应该输出什么控制动作”。** 但这只是典型分工，World-Action 联合训练正在模糊两者之间的界线。

## 为什么仿真不能完全替代真实数据？

一个仿真中成功率 99% 的抓取策略，可能遇到真实世界的物体形变、光照、机械间隙、夹爪摩擦和未知干扰而显著掉点。**仿真扩大覆盖，真实数据校准现实。**

## 自主数据和专家示范为何互补？

```text
Human Demonstrations
     ↓
Behavior Cloning → Policy v1
     ↓
Autonomous Robot Execution
     ↓
Failures / Rewards / Human Corrections
     ↓
Policy Improvement → Policy v2
```

纯专家数据一般不充分覆盖模型走偏后会进入的状态。自主数据可用于学习恢复和纠偏，但需要区分好动作、坏动作及结果，而不是无差别模仿。

## 真正该比较的不是文件大小

对于训练价值，通常还需要看：

- **Action coverage**：关节、末端位姿、夹爪、力控等动作空间是否匹配目标机器人？
- **Diversity**：任务、物体、初始条件、环境、机器人类型是否多样？
- **Temporal integrity**：Camera、IMU、Action 等是否同步？
- **Annotation & Feedback**：成功、失败、错误类型和干预是否可信？
- **Model utility**：引入这类数据后，未见任务和真实部署性能有无提升？

下一步：[Data Recipe 如何分配训练阶段和混合权重](?page=data-recipe)。
