> **IL 学“别人怎么做”；RL 学“做完会怎样”；World Model 学“世界将怎么变化”。** 三者相关，但不是同一种算法。

## Imitation Learning / Behavior Cloning

给模型专家示范，让它模仿专家选择动作。真实遥操数据最直接；UMI 和跨机器人数据需要解决 action representation / retargeting。

**优势**：有高质量专家动作时收敛直接、容易开始。**问题**：分布偏移（distribution shift）——模型一旦做错，可能进入专家示范没出现过的状态。

## Reinforcement Learning

机器人执行动作，环境返回下一状态以及奖励/反馈，模型据此优化策略。

```text
State → Policy → Action → Environment
  ↑                       ↓
  └──── Next State + Reward
```

**优势**：可以通过试错改进真实任务表现，不局限于模仿。**问题**：真实机器人探索成本高且有安全风险；reward 设计和评估也不简单。

实际研究中有 on-policy RL、offline RL、human intervention、reward modeling 等不同方法；失败数据不应一概当作专家动作。

## World Model

学习给定当前状态及可选动作后，世界如何演化。可以预测 future observations、latent states 或其它环境表征。

```text
Current Observation + (Candidate Action)
                 ↓
             World Model
                 ↓
           Future State / Video
```

World Model 可以用于学习物理先验、产生候选未来、规划或训练策略，**不等同于已经拥有机器人可执行的 Policy**。

## Inverse Dynamics Model（IDM）

IDM 反过来回答：如果看到环境从 A 变到 B，机器人做了什么动作？

```text
Frame A + Frame B → IDM → Possible Robot Actions
```

这可以帮助把视频学习到的状态变化与机器人 action space 对接。由于动作可能不唯一，IDM 的结果也并非天然完全正确。

## World-Action Model（WAM）

一些新模型同时学习 future visual states 与 robot actions，用共享模型连接世界变化预测和动作生成。[NVIDIA GR00T 2](?page=company-nvidia)、[AgiBot GE-Act 2.0](?page=company-agibot) 是可参考的公开案例。

## 为什么自主 Rollout 数据重要

纯专家轨迹通常只覆盖专家会去的状态；机器人自己执行时可能抓偏、碰到障碍、掉落物体。收集这些轨迹并保留失败、干预、任务进度及结果标签，有机会训练更可靠的恢复策略。

但**不能把任何失败轨迹直接作为正确 BC target**：必须结合数据质量、动作条件或 RL objective。

## 推荐一起对照

[从示范到训练的步骤](?page=training-loop) / [VLA 与动作生成](?page=model-architecture) / [1X World Model](?page=company-1x) / [Physical Intelligence 的自主学习](?page=company-pi)。
