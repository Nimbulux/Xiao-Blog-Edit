由于 Snap 包管理器以及 Snap 包在 Ubuntu 预装且行为过于流氓，许多用户深受其扰。本文介绍在 Ubuntu 中**完全移除 Snap 软件包**的步骤：卸载已安装的 Snap 组件、阻止 apt 自动重装、以及用 apt/PPA 替代 Snap 版的软件商店与 Firefox。

> **警告**：这些步骤会移除 Ubuntu 系统中两个关键程序：软件商店和 Firefox，执行前请确认已做好备份。

---

## 卸载 Snap 软件包

### 查看已安装的 Snap 包

```bash
snap list
```

> 输出包含 Firefox、软件商店、主题以及其它默认已安装的核心包。

### 按顺序移除 Snap 包

```bash
sudo snap remove --purge firefox
sudo snap remove --purge snap-store
sudo snap remove --purge gnome-3-38-2004
sudo snap remove --purge gtk-common-themes
sudo snap remove --purge snapd-desktop-integration
sudo snap remove --purge bare
sudo snap remove --purge core24 core20 core18 # 具体请看 snap list 列出的 core 版本
sudo snap remove --purge snapd
```

> 建议按上述顺序依次卸载，因为部分 Snap 包可能依赖其它 Snap 包。

最后通过 apt 移除 Snap 服务：

```bash
sudo apt remove --autoremove snapd
```

---

## 阻止 apt 自动重装 Snap

即使卸载了 Snap 包，若不关闭 `apt 触发器`，`sudo apt update` 会再次把 Snap 安装回来。在 `/etc/apt/preferences.d/` 下创建 apt 设置文件 `nosnap.pref` 即可关闭：

```bash
sudo tee /etc/apt/preferences.d/nosnap.pref > /dev/null << 'EOF'
Package: snapd
Pin: release a=*
Pin-Priority: -10
EOF
```

再次运行 `sudo apt update`，移除 Snap 的步骤即全部完成。

---

## 替换 Snap 应用

### 安装 apt 版 GNOME 软件商店

```bash
sudo apt install --install-suggests gnome-software
```

> 必须使用 `--install-suggests` 参数，否则 Snap 又会被拉回来。

### 安装 apt 版 Firefox

```bash
sudo add-apt-repository ppa:mozillateam/ppa
sudo apt update
sudo apt install -t 'o=LP-PPA-mozillateam' firefox
```

为避免 apt update 再次安装 Snap 版 Firefox，创建优先级设置文件给予以上 PPA 超高优先权：

```bash
sudo tee /etc/apt/preferences.d/mozillateamppa > /dev/null << 'EOF'
Package: firefox*
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 501
EOF
```
