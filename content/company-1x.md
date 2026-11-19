> **1X：先用视频预测未来，再把未来视觉变化转成机器人动作。**

## 1X World Model 公开的训练量

| 环节 | 数据量 |
|---|---:|
| Egocentric human video mid-training | **900 h** |
| Robot embodiment fine-tuning | **70 h** |
| Inverse Dynamics Model training | **400 h** robot data |

以上属于官方公开的一个具体 World Model 实验配方。它们**服务于不同训练目标**，不能简单加起来说“总共 1,370 小时同一种训练数据”。

原始来源：[1X World Model — From Video to Action](https://www.1x.tech/discover/world-model-self-learning)。

## 模型流程

```text
Current Frame + Language Instruction
                  ↓
              World Model
                  ↓
          Predicted Future Video
                  ↓
         Inverse Dynamics Model
                  ↓
           Robot Action Sequence
                  ↓
                 NEO
```

**World Model** 学习物体和环境在时间中的变化；**IDM** 学习什么动作能导致从前一帧转移到后一帧。

## 为什么 400h 的 IDM Data 可以和 900h Human Video 互补？

Human Video 通常没有 NEO 的原生 motor commands，但有丰富的环境变化；Robot Action Data 可以告诉 IDM 某类画面变化与机器人的执行命令如何对应。

## 主要局限

视觉上合理的未来不保证物理可行；状态转移可能由多种动作产生；IDM 估计的动作还需要真实系统验证。

关联：[World Model / IL / RL](?page=learning-paradigms)、[数据来源](?page=data-taxonomy)。
