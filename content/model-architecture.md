> 这一章先搭建模型词汇体系，后续可继续扩写公式、网络模块、PyTorch 实现和论文复现，不急于一次讲完。

## VLM 与 VLA

**VLM（Vision-Language Model）** 处理视觉与语言的联合理解，典型输出可以是文字或结构化描述。

**VLA（Vision-Language-Action Model）** 则进一步把 observation 和语言条件映射到机器人动作（或 action chunks）。

```text
Visual Observation + Language + Robot State
                  ↓
             VLA Policy
                  ↓
    Joint / EE / Gripper Action Chunk
```

## Action Representation

机器人 policy 不一定输出相同类型的动作：

| 动作表示 | 例子 | 意义 |
|---|---|---|
| Joint position | `q_target` | 直接给关节位置目标 |
| Joint velocity | `dq/dt` | 速度命令 |
| EE delta pose | `Δx, Δy, Δz, Δrotation` | 在笛卡尔空间移动末端 |
| Gripper action | `open/close` or width | 末端执行器命令 |
| Whole-body command | base + arms + hands | 多部位协同动作 |

动作表示决定训练数据需要怎样归一化、对齐以及在部署时怎样解码。

## Diffusion Policy

把连续动作序列看成需要生成的样本：训练模型从带噪声的动作逐步恢复合理的动作轨迹。适合表示多峰策略，例如同一个杯子可以从不同方向抓取。

## Flow Matching

学习把简单分布连续映射到目标动作分布的速度场。Physical Intelligence 的 π0 路线采用了 Flow Model 的思想。

需要注意：**Diffusion 与 Flow Matching 都是生成连续动作的建模方法**，不等于整个 VLA 系统，也不替代观测编码、动作执行、安全约束和系统集成。

## Action Chunk 与实时执行

模型可以预测 H 步 future actions，再滚动执行和重新推理；动作时间尺度、执行频率、推理延迟与新感知的接入方式，都是部署时需要决定的系统参数。

## 后续可以深入的技术分支

- Transformer attention 如何连接视觉、语言与机器人状态
- Diffusion denoising objective、noise schedule、采样器
- Flow matching 的 ODE 观点和条件动作生成
- Action tokenizer / FAST 与 autoregressive action generation
- Multi-embodiment 训练时怎样统一 action space
- World Model + IDM + Policy 的系统架构

入门资料：[π0 原始论文](https://www.physicalintelligence.company/download/pi0.pdf)、[NVIDIA GR00T 2 官方研究](https://research.nvidia.com/labs/gear/gr00t-2/)。
