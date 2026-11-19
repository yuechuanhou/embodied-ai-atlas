> **Encoder 测机械轴的运动；IMU 测惯性运动；Camera 提供外部世界几何信息。** 融合它们可以互相约束误差。

## Encoder 与 IMU

Encoder 常测 wheel / joint 的旋转角度、速度或直线位移；增量式 encoder 通常需要 homing，绝对式 encoder 可以提供绝对位置读数。Wheel encoder 用轮子转角估计里程，遇到 slip 时会偏离真实运动。

IMU（Inertial Measurement Unit）主要包含 **3-axis accelerometer + 3-axis gyroscope**：测 specific force 和 angular velocity。它能提供高频运动信息，但积分后会累计 bias/drift。静止平放时加速度计可能读到约 `±9.81 m/s²`，是测量比力/支撑效应，不代表设备正在以该数值向上运动。

| 项目 | Encoder | IMU |
|---|---|---|
| 直接测量 | 轴/关节位置与运动 | 比力、角速度 |
| 常安装在 | 轮子、电机、关节 | 机器人机体/链接 |
| 典型误差 | 打滑、传动误差、量化误差 | Bias、噪声、积分漂移 |
| 用途 | Odometry、Joint State | 姿态估计、短期运动传播 |

## Stereo 与 Fisheye 是不同维度

- **Stereo**：两个已知相对位姿且有视野重叠的相机形成双目，利用 disparity / triangulation 估计深度。
- **Fisheye**：超广角镜头与其成像模型，通常提供更大 FOV，也带来显著畸变。
- **RGB**：颜色通道类型，可以与前两者组合。

例如 `Stereo RGB Fisheye` 完全合理。经典双目针孔近似：

```text
Depth Z ≈ focal_length f × baseline B / disparity d
```

## 相机内参和外参

内参可写为 `K = [[fx,0,cx],[0,fy,cy],[0,0,1]]`，给定 3D camera point `(X,Y,Z)`，针孔模型投影为：

```text
u = fx · X/Z + cx
v = fy · Y/Z + cy
```

真实镜头还要建模径向/切向畸变或 fisheye projection。外参则是 frame 之间的旋转 + 平移，可以用 4×4 homogeneous transform 表示。

## VIO（Visual-Inertial Odometry）

结合 Camera 的视觉 feature / reprojection constraints 和 IMU 的高频加速度、角速度，估计连续 6-DoF pose、速度以及 IMU bias。

```text
IMU (100–400Hz) ──> Propagation / Preintegration ──┐
                                                  ├─> Filter / Optimization → Pose
Camera (e.g.30Hz) ──> Feature Tracking / Reprojection ┘
```

IMU 在两帧 Camera 之间做高频预测，Camera 通过可观测几何来约束漂移。典型方法有 EKF/MSCKF、滑动窗口优化、factor graph。

## SLAM 与 VIO

**VIO** 主要估计相对运动轨迹，通常会 drift；**SLAM** 同时定位和建立地图，可能通过 loop closure 与全局优化改善长期一致性（但不是所有 SLAM 实现都必然具备回环检测）。

```text
Sensors → VIO/Odometry → Local Motion Estimate
                          ↓
                SLAM / Map / Loop Closure
                          ↓
                   Map / Localization
```

这些状态估计结果会进一步影响 [TF Tree](?page=geometry-and-frames) 和 [机器人数据采集](?page=data-pipeline)。
