# ComfyUI AMD GPU Monitor (Multi-GPU Fork)

A lightweight AMD GPU overlay for ComfyUI that shows **live utilization, VRAM usage, and temperature** for **all** detected AMD GPUs, with a compact, Crystools-style UI.

This is a fork of [iDAPPA/ComfyUI-AMDGPUMonitor](https://github.com/iDAPPA/ComfyUI-AMDGPUMonitor) with multi-GPU support and a richer frontend panel.

---

## ✨ Features

- ✅ **Multi-GPU support**  
  Automatically detects all AMD GPUs (`card0`, `card1`, …) via `rocm-smi` / `amd-smi` and shows each one in its own row.

- ✅ **Per-GPU stats**
  - GPU utilization %
  - VRAM used / total (MB/GB) and %
  - Temperature (°C)

- ✅ **Driver / platform info**
  - Shows backend platform (e.g. ROCm) and driver / SMI versions in the header (when available).

- ✅ **Compact floating panel**
  - Draggable overlay inside ComfyUI
  - Collapse / expand
  - Remember position and closed state via `localStorage`

- ✅ **Node still works**
  - The `AMDGPUMonitor` node remains available in the node list so you can:
    - Control the update interval
    - Pipe a human-readable stats string into logs or other nodes

---

## 📦 Requirements

- ComfyUI (latest recommended)
- Linux with AMD GPU
- ROCm or AMD driver stack providing:
  - `rocm-smi` **or** `amd-smi` available on `$PATH` or in common locations  
- Python libraries: only standard library is used; no extra `pip` deps required

---

## 🔧 Installation

You can install this node either manually or via ComfyUI Manager.

### Method 1 — Manual install

1. Go to your ComfyUI `custom_nodes` directory, e.g.:

   ```bash
   cd /path/to/ComfyUI/custom_nodes
