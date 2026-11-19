> **URDF 定义机器人结构；TF Tree 描述运行时坐标系变换；FK/IK 负责在关节空间与末端位姿之间换算。**

## 坐标系和右手定则

机器人常用右手坐标系，例如 ROS 常见 base frame：`+X forward, +Y left, +Z up`。正旋转方向遵循右手定则：大拇指指向正轴，四指弯曲方向是正转。**从正轴方向朝原点看，正转是逆时针**。

| 角度 | 对应轴 | 常见直觉 |
|---|---|---|
| Roll | X | 左右侧倾 |
| Pitch | Y | 抬头/低头 |
| Yaw | Z | 左右转向 |

Pose 含三维位置 + 三个旋转自由度。软件内部可能使用 quaternion `(qx,qy,qz,qw)`，虽然有四个数，仍只有 3 个旋转 DoF。

## URDF = 结构描述

URDF（Unified Robot Description Format）使用 XML 描述 link、joint、几何、惯量和连接关系。比如：

```xml
<joint name="camera_joint" type="fixed">
  <parent link="base_link"/>
  <child link="camera_link"/>
  <origin xyz="0.3 0 0.5" rpy="0 0 0"/>
</joint>
```

它表达 `camera_link` 相对 `base_link` 前方 0.3m、上方 0.5m，且没有额外旋转。**joint 的 parent / child 在 URDF 里指的是 link；TF 中的 parent / child 指 frame。**

## TF Tree = 当前坐标变换关系

```text
map
 ↓
odom
 ↓
base_link
 ↓
shoulder_link
 ↓
elbow_link
 ↓
camera_link
```

机器人移动时 `odom → base_link` 改变；机械臂转动时 `shoulder_link → elbow_link` 改变。URDF 不需要改变，但 TF 的时间相关数值会更新。URDF + joint states 可由 robot_state_publisher 计算内部 kinematic transforms；`map → odom` 及 `odom → base_link` 通常来自定位/里程计系统。

若用 `T_A_B` 表示把 B frame 中的点变到 A frame，则：

```text
T_map_camera = T_map_odom · T_odom_base · T_base_camera
p_map = T_map_camera · p_camera  （齐次坐标）
```

## FK（正运动学）

知道关节状态，沿机器人 kinematic chain 逐级连乘 transform，求 end-effector pose。

二维两连杆例子：

```text
x = L1·cos(θ1) + L2·cos(θ1+θ2)
y = L1·sin(θ1) + L2·sin(θ1+θ2)
```

## IK（逆运动学）

已知 target end-effector pose，反过来求 joint angles。通常有 analytical solution、Jacobian numerical IK 和 constrained optimization 三类思路。

- **可能多解**：elbow-up / elbow-down。
- **可能无解**：目标超出工作空间或 joint limits。
- **通常不负责完整安全路径**：从当前姿态到目标姿态的无碰撞 trajectory 往往交给 motion planning。

## Camera Intrinsics 与 Extrinsics

Intrinsics（如 `fx, fy, cx, cy`）决定 Camera 3D point 如何投影到 image pixel；Extrinsics 是 camera frame 相对于 robot/world frame 的刚体变换。双目需要左右各自内参及两者之间外参；VIO 需要 camera–IMU 外参。

进一步阅读：[传感器与估计](?page=sensors-and-estimation)、[机器人数据 Schema](?page=data-pipeline)。
