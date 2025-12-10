import os
import sys
import json
import time
import subprocess
import threading
from server import PromptServer

# Global structure: stats per GPU keyed by "card0", "card1", ...
gpu_stats = {}
driver_info = {
    "device_type": "rocm",
    "driver_version": "",
    "smi_version": "",
}

# Monitor thread control
monitor_thread = None
thread_control = threading.Event()
monitor_update_interval = 1.0  # seconds


def find_rocm_smi():
    """Find the rocm-smi or amd-smi executable."""
    rocm_paths = [
        "/opt/rocm/bin/rocm-smi",
        "/usr/bin/rocm-smi",
        "/usr/local/bin/rocm-smi",
        "/opt/amdgpu-pro/bin/amd-smi",
        "/usr/bin/amd-smi",
    ]
    for path in rocm_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    # Try PATH lookups
    for cmd in ("rocm-smi", "amd-smi"):
        try:
            result = subprocess.run(
                ["which", cmd],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if result.returncode == 0:
                p = result.stdout.strip()
                if p:
                    return p
        except Exception:
            pass

    return None


def run_rocm_smi_command(rocm_smi_path, *args, json_output=False):
    """
    Run a rocm-smi command and return parsed JSON or raw text.

    If json_output=True, expects --json output and returns dict on success,
    otherwise returns {}.
    """
    if not rocm_smi_path:
        return {} if json_output else ""

    cmd = [rocm_smi_path] + list(args)
    # Ensure json flag if requested
    if json_output and "--json" not in cmd:
        cmd.append("--json")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return {} if json_output else result.stdout

        if json_output:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {}
        else:
            return result.stdout
    except subprocess.TimeoutExpired:
        return {} if json_output else ""
    except Exception:
        return {} if json_output else ""


def ensure_card(stats_dict, card_name):
    """Get or create a stats dict for a given card key."""
    if card_name not in stats_dict:
        stats_dict[card_name] = {
            "gpu_utilization": 0,
            "vram_used": 0,
            "vram_total": 0,
            "vram_used_percent": 0,
            "gpu_temperature": 0,
            "name": "",
        }
    return stats_dict[card_name]


def update_driver_info(rocm_smi_path):
    """Populate driver_info using rocm-smi if possible."""
    global driver_info

    # Driver version
    text = run_rocm_smi_command(rocm_smi_path, "--showdriverversion", json_output=False)
    if text:
        # Best-effort parse: first non-empty line
        for line in text.splitlines():
            line = line.strip()
            if line:
                driver_info["driver_version"] = line
                break

    # SMI version (optional, may not exist on all versions)
    text = run_rocm_smi_command(rocm_smi_path, "--showversion", json_output=False)
    if text:
        for line in text.splitlines():
            line = line.strip()
            if line:
                driver_info["smi_version"] = line
                break


def get_all_gpu_info(rocm_smi_path):
    """Collect utilization, memory and temperature for all GPUs."""
    global gpu_stats

    # Start fresh each update so removed cards don't linger
    new_stats = {}

    # 1) Utilization
    try:
        info_use = run_rocm_smi_command(
            rocm_smi_path, "--showuse", json_output=True
        )
        if isinstance(info_use, dict):
            for card_name, card_info in info_use.items():
                if not card_name.startswith("card"):
                    continue
                stats = ensure_card(new_stats, card_name)
                gpu_use = card_info.get("GPU use (%)", 0)
                if isinstance(gpu_use, str):
                    gpu_use = gpu_use.replace("%", "").strip() or "0"
                try:
                    stats["gpu_utilization"] = int(float(gpu_use))
                except Exception:
                    stats["gpu_utilization"] = 0
    except Exception:
        pass

    # 2) VRAM
    try:
        info_mem = run_rocm_smi_command(
            rocm_smi_path, "--showmeminfo", "vram", json_output=True
        )
        if isinstance(info_mem, dict):
            for card_name, card_info in info_mem.items():
                if not card_name.startswith("card"):
                    continue
                stats = ensure_card(new_stats, card_name)

                total_b = card_info.get("VRAM Total Memory (B)")
                used_b = card_info.get("VRAM Total Used Memory (B)")
                try:
                    if total_b is not None and used_b is not None:
                        vram_total = int(int(total_b) / (1024 * 1024))
                        vram_used = int(int(used_b) / (1024 * 1024))
                        stats["vram_total"] = vram_total
                        stats["vram_used"] = vram_used
                        stats["vram_used_percent"] = (
                            int((vram_used / vram_total) * 100)
                            if vram_total > 0
                            else 0
                        )
                except Exception:
                    # leave previous or default values
                    pass
    except Exception:
        pass

    # 3) Temperature
    try:
        info_temp = run_rocm_smi_command(
            rocm_smi_path, "--showtemp", json_output=True
        )
        if isinstance(info_temp, dict):
            for card_name, card_info in info_temp.items():
                if not card_name.startswith("card"):
                    continue
                stats = ensure_card(new_stats, card_name)

                temp_str = None
                if "Temperature (Sensor edge) (C)" in card_info:
                    temp_str = card_info["Temperature (Sensor edge) (C)"]
                elif "Temperature (Sensor junction) (C)" in card_info:
                    temp_str = card_info["Temperature (Sensor junction) (C)"]

                if temp_str is not None:
                    if isinstance(temp_str, str):
                        temp_str = temp_str.replace("°C", "").strip() or "0"
                    try:
                        stats["gpu_temperature"] = int(float(temp_str))
                    except Exception:
                        stats["gpu_temperature"] = 0
    except Exception:
        pass

    # 4) Product name (nice-to-have label)
    try:
        info_name = run_rocm_smi_command(
            rocm_smi_path, "--showproductname", json_output=True
        )
        if isinstance(info_name, dict):
            for card_name, card_info in info_name.items():
                if not card_name.startswith("card"):
                    continue
                stats = ensure_card(new_stats, card_name)
                # Keys vary by ROCm version, try a few
                name = (
                    card_info.get("Card series")
                    or card_info.get("Card model")
                    or card_info.get("Product name")
                )
                if isinstance(name, str):
                    stats["name"] = name.strip()
    except Exception:
        pass

    # Atomically swap global stats
    gpu_stats = new_stats
    return gpu_stats


def build_payload():
    """Format data for the frontend."""
    # Build ordered list (card0, card1, …)
    cards = sorted(gpu_stats.keys())
    gpus = []
    for idx, card_name in enumerate(cards):
        s = gpu_stats[card_name]
        label = s.get("name") or card_name or f"GPU{idx}"
        gpus.append(
            {
                "index": idx,
                "card": card_name,
                "label": label,
                "gpu_utilization": s.get("gpu_utilization", 0),
                "gpu_temperature": s.get("gpu_temperature", 0),
                "vram_total": s.get("vram_total", 0),
                "vram_used": s.get("vram_used", 0),
                "vram_used_percent": s.get("vram_used_percent", 0),
            }
        )

    data = {
        "device_type": driver_info.get("device_type", "rocm"),
        "driver": {
            "driver_version": driver_info.get("driver_version", ""),
            "smi_version": driver_info.get("smi_version", ""),
        },
        "gpus": gpus,
    }
    return data


def send_monitor_update():
    """Send monitor update data to the frontend."""
    data = build_payload()
    try:
        PromptServer.instance.send_sync("amd_gpu_monitor", data)
    except Exception:
        pass


def monitor_thread_function():
    """Thread function to continuously monitor GPU stats."""
    global monitor_update_interval

    rocm_smi_path = find_rocm_smi()
    if not rocm_smi_path:
        print("AMD GPU Monitor ERROR: Could not find rocm-smi or amd-smi executable")
        return

    print(f"AMD GPU Monitor: Using SMI tool: {rocm_smi_path}")

    # Try to grab driver info once up-front
    update_driver_info(rocm_smi_path)

    while not thread_control.is_set():
        try:
            get_all_gpu_info(rocm_smi_path)
            send_monitor_update()
        except Exception:
            pass

        time.sleep(monitor_update_interval)


def start_monitor_thread():
    """Start the GPU monitoring thread."""
    global monitor_thread, thread_control

    if monitor_thread is not None and monitor_thread.is_alive():
        # Already running
        return

    thread_control.clear()
    monitor_thread = threading.Thread(target=monitor_thread_function)
    monitor_thread.daemon = True
    monitor_thread.start()
    print("AMD GPU Monitor thread started")


def stop_monitor_thread():
    """Stop the GPU monitoring thread."""
    global monitor_thread, thread_control

    if monitor_thread is None or not monitor_thread.is_alive():
        return

    thread_control.set()
    monitor_thread.join(timeout=5)
    print("AMD GPU Monitor thread stopped")


# Start the monitor thread when this module is loaded
start_monitor_thread()


class AMDGPUMonitor:
    """
    A placeholder node for ComfyUI.

    The actual monitoring is done via a background thread; this node just
    lets the user tweak the update interval and exposes stats as a string.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "update_interval": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1},
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "monitor_gpu"
    CATEGORY = "AMD GPU"

    def monitor_gpu(self, update_interval):
        """Update interval can be changed via input."""
        global monitor_update_interval
        monitor_update_interval = float(update_interval)

        # Build a compact multi-GPU status string for debugging
        parts = []
        cards = sorted(gpu_stats.keys())
        for idx, card_name in enumerate(cards):
            s = gpu_stats[card_name]
            label = s.get("name") or card_name or f"GPU{idx}"
            part = (
                f"{label}: "
                f"{s.get('gpu_utilization', 0)}% | "
                f"VRAM {s.get('vram_used', 0)}MB/"
                f"{s.get('vram_total', 0)}MB "
                f"({s.get('vram_used_percent', 0)}%) | "
                f"{s.get('gpu_temperature', 0)}°C"
            )
            parts.append(part)

        stats_str = " | ".join(parts) if parts else "No AMD GPUs detected"
        return (stats_str,)


NODE_CLASS_MAPPINGS = {
    "AMDGPUMonitor": AMDGPUMonitor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AMDGPUMonitor": "AMD GPU Monitor",
}


def cleanup():
    """Called by ComfyUI when shutting down."""
    stop_monitor_thread()


# Web directory setup for ComfyUI to find our JS files
WEB_DIRECTORY = os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")
print(f"AMD GPU Monitor: Web directory set to {WEB_DIRECTORY}")
