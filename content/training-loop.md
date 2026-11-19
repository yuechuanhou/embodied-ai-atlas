> **从采集一个 episode 到训练一个机器人模型，本质是把“看到什么 → 应该执行什么动作”转成可优化的训练目标。**

## 1. 一段 Pick & Place 演示

操作员遥控机器人把杯子放进托盘，记录任务指令、相机画面、关节/夹爪状态、动作和时间戳：

```text
Task: Pick up the cup and place it in the tray

Observation:
  RGB / Depth
  Robot joints / gripper state
  End-effector pose

Action:
  Joint target / EE delta pose / gripper command

Metadata:
  Timestamp / calibration / success flag
```

原始日志经过 [数据处理与 Schema](?page=data-pipeline)，得到成对的 observation 和 action。

## 2. Behavior Cloning（BC）

训练数据写成：

```text
D = {(o_t, a_t)} for t = 1,...,N
```

模型预测动作：

```text
â_t = πθ(o_t, language_instruction)
```

比如专家让夹爪沿 X 正向移动 2cm，模型预测 1.5cm，就根据误差更新参数。一个最简单的连续回归目标是：

```text
L_BC = (1/N) × Σ_t ||πθ(o_t,l) - a_t||²
```

这只是帮助理解 BC 的简化公式。现代连续动作生成模型可能使用 **Diffusion / Flow Matching**，不直接对最终单一步动作计算 MSE。

## 3. Action Chunking（动作块）

模型不一定只预测下一步动作，也可以一次预测未来 H 步：

```text
A_t = [a_t, a_{t+1}, ..., a_{t+H-1}]
```

执行方案可能是：

```text
Current Observation
       ↓
VLA → Predict Future Action Chunk
       ↓
Execute First Several Actions
       ↓
Read New Observation
       ↓
Replan
```

这与滚动控制（receding horizon）的思路相似。Chunk 太短可能使推理开销大；Chunk 太长则可能对新出现的遮挡、碰撞、物体滑动反应较慢。

## 4. 机器人可以“直接用视频学习动作”吗？

如果是普通人类视频，通常**不能直接套用上面的动作回归损失**，因为没有机器人目标 action。可能的路线包括：

- Video Prediction：学习未来环境状态变化；
- Inverse Dynamics Model：由前后状态估计对应动作；
- Retargeting：把人类手/工具轨迹映射到机器人；
- Video-conditioned Policy：把视频示范作为上下文；
- Robot data fine-tuning：通过少量目标机器人数据做适配。

## 5. Policy 训练之后还差什么？

**Policy 的动作输出不等于完整的机器人软件栈。** 真实执行仍要经过动作解码、频率对齐、运动规划或低层控制、碰撞约束与安全检查。然后才能运行真实机器人、获取 rollout 并形成 [反馈闭环](?page=data-flywheel)。

## 和传统机器人控制有什么关系？

你前面学的 [IK / FK](?page=geometry-and-frames) 仍然有价值：某些 VLA 预测 end-effector delta pose，之后仍要通过 IK 或控制器将其转换为可执行关节目标；另一些模型直接输出关节命令。动作表示的不同，会影响训练数据 Schema 和 deployment pipeline。
