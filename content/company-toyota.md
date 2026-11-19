> **Toyota Research Institute 的 Large Behavior Model（LBM）特别适合研究“公开且可核对的多来源数据配方”。**

## 公开数据池

| 数据来源 | 小时数 |
|---|---:|
| Internally collected bimanual robot teleoperation | **468 h** |
| Simulation-collected teleoperation | **45 h** |
| Universal Manipulation Interface（UMI） | **32 h** |
| Curated Open X-Embodiment data | **约 1,150 h** |

来源：[A Careful Examination of Large Behavior Models for Multitask Dexterous Manipulation](https://toyotaresearchinstitute.github.io/lbm1/)。

## 训练路线

模型使用多任务的机器人操作数据来训练能够直接生成动作的 policy，其中包含 diffusion-style action generation，并进行实际机器人任务上的评估。

## 为什么这组数据很有教学价值？

它同时包含：

1. **自己的真实机器人遥操**：目标平台动作质量较高；
2. **对应仿真遥操**：扩展场景和轨迹；
3. **UMI**：用手持操作设备产生额外示范；
4. **Open X-Embodiment**：引入跨机器人多任务知识。

与单一数据源相比，混合数据有机会扩大任务覆盖和泛化，但必须配合动作规范化及有效评估。

## 注意数据比较口径

这是一篇研究公开的特定 LBM 配方，并不能代表 TRI 所有模型或更新版本。官方报告中的内部任务与其他公司评测协议不同，**不能直接横向比较成功率**。

关联：[Data Recipe](?page=data-recipe) / [Diffusion Policy](?page=model-architecture)。
