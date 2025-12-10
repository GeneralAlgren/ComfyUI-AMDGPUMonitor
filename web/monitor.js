import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Create the monitor UI element
const createMonitorElement = () => {
    // Create main container
    const container = document.createElement("div");
    container.className = "amd-gpu-monitor";
    container.style.position = "absolute";
    container.style.top = "40px"; // Moved down to avoid toolbar
    container.style.right = "5px";
    container.style.zIndex = "1000";
    container.style.backgroundColor = "#1a1a1a";
    container.style.color = "#fff";
    container.style.padding = "10px";
    container.style.borderRadius = "5px";
    container.style.fontFamily = "monospace";
    container.style.fontSize = "12px";
    container.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
    container.style.width = "260px";
    container.style.userSelect = "none";
    
    // Add title
    const title = document.createElement("div");
    title.style.fontWeight = "bold";
    title.style.marginBottom = "4px";
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.justifyContent = "space-between";
    title.innerHTML = '<span style="color: #ff5555;">AMD GPU Monitor</span>';
    
    // Add collapse button
    const collapseButton = document.createElement("button");
    collapseButton.innerHTML = "−"; // Unicode minus sign
    collapseButton.style.background = "none";
    collapseButton.style.border = "none";
    collapseButton.style.color = "#888";
    collapseButton.style.cursor = "pointer";
    collapseButton.style.fontSize = "14px";
    collapseButton.style.padding = "0 5px";
    collapseButton.title = "Collapse/Expand";
    
    // Add close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = "×"; // Unicode times sign
    closeButton.style.background = "none";
    closeButton.style.border = "none";
    closeButton.style.color = "#888";
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "14px";
    closeButton.style.padding = "0 5px";
    closeButton.title = "Close";
    
    const buttonContainer = document.createElement("div");
    buttonContainer.appendChild(collapseButton);
    buttonContainer.appendChild(closeButton);
    
    title.appendChild(buttonContainer);
    container.appendChild(title);

    // Driver/platform info line
    const driverLine = document.createElement("div");
    driverLine.className = "amd-gpu-monitor-driver";
    driverLine.style.fontSize = "10px";
    driverLine.style.color = "#aaa";
    driverLine.style.marginBottom = "6px";
    container.appendChild(driverLine);
    
    // Content container that can be collapsed
    const content = document.createElement("div");
    content.className = "amd-gpu-monitor-content";
    container.appendChild(content);

    // This will hold one row per GPU
    const gpuList = document.createElement("div");
    gpuList.className = "amd-gpu-monitor-gpu-list";
    gpuList.style.display = "flex";
    gpuList.style.flexDirection = "column";
    gpuList.style.gap = "6px";
    content.appendChild(gpuList);
    
    // Add event listener for collapsing
    let isCollapsed = false;
    collapseButton.addEventListener("click", () => {
        if (isCollapsed) {
            content.style.display = "block";
            collapseButton.innerHTML = "−";
            isCollapsed = false;
        } else {
            content.style.display = "none";
            collapseButton.innerHTML = "+";
            isCollapsed = true;
        }
    });
    
    // Add event listener for closing
    closeButton.addEventListener("click", () => {
        container.style.display = "none";
        // Store the closed state in localStorage
        localStorage.setItem("amd-gpu-monitor-closed", "true");
    });
    
    // Make the monitor draggable
    let isDragging = false;
    let dragOffsetX, dragOffsetY;
    
    title.addEventListener("mousedown", (e) => {
        // Only handle main button (left button)
        if (e.button !== 0) return;
        
        isDragging = true;
        dragOffsetX = e.clientX - container.offsetLeft;
        dragOffsetY = e.clientY - container.offsetTop;
        
        // Prevent text selection during drag
        e.preventDefault();
    });
    
    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;
        
        // Keep monitor within window bounds
        const maxX = window.innerWidth - container.offsetWidth;
        const maxY = window.innerHeight - container.offsetHeight;
        
        container.style.left = Math.max(0, Math.min(x, maxX)) + "px";
        container.style.top = Math.max(0, Math.min(y, maxY)) + "px";
        
        // We're now positioning with left instead of right
        container.style.right = "auto";
    });
    
    document.addEventListener("mouseup", () => {
        isDragging = false;
        
        // Save position to localStorage
        if (container.style.left && container.style.top) {
            localStorage.setItem("amd-gpu-monitor-position", JSON.stringify({
                left: container.style.left,
                top: container.style.top
            }));
        }
    });
    
    // Load saved position if available
    const savedPosition = localStorage.getItem("amd-gpu-monitor-position");
    if (savedPosition) {
        try {
            const { left, top } = JSON.parse(savedPosition);
            container.style.left = left;
            container.style.top = top;
            container.style.right = "auto";
        } catch (e) {
            // Silently fail and use default position
        }
    }
    
    // Check if monitor was closed previously
    if (localStorage.getItem("amd-gpu-monitor-closed") === "true") {
        container.style.display = "none";
    }
    
    // Add a button to show the monitor again
    const showButton = document.createElement("button");
    showButton.textContent = "Show AMD GPU Monitor";
    showButton.style.position = "fixed";
    showButton.style.top = "5px";
    showButton.style.right = "5px";
    showButton.style.zIndex = "999";
    showButton.style.padding = "5px";
    showButton.style.borderRadius = "3px";
    showButton.style.backgroundColor = "#333";
    showButton.style.color = "#fff";
    showButton.style.border = "none";
    showButton.style.fontSize = "12px";
    showButton.style.cursor = "pointer";
    showButton.style.display = "none";
    
    showButton.addEventListener("click", () => {
        container.style.display = "block";
        showButton.style.display = "none";
        localStorage.removeItem("amd-gpu-monitor-closed");
    });
    
    document.body.appendChild(showButton);
    
    // Toggle showButton visibility based on monitor visibility
    const updateShowButtonVisibility = () => {
        if (container.style.display === "none") {
            showButton.style.display = "block";
        } else {
            showButton.style.display = "none";
        }
    };
    
    // Create a MutationObserver to watch for changes to container's display style
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === "style") {
                updateShowButtonVisibility();
            }
        });
    });
    
    observer.observe(container, { attributes: true });
    
    // Initial visibility check
    updateShowButtonVisibility();
    
    // Store GPU rows here, keyed by card or index
    const gpuRows = {};

    return {
        container,
        content,
        gpuList,
        driverLine,
        gpuRows
    };
};

// Helper to build a single GPU row
const createGpuRow = (label) => {
    const row = document.createElement("div");
    row.className = "amd-gpu-monitor-row";
    row.style.borderTop = "1px solid #333";
    row.style.paddingTop = "4px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "baseline";
    header.style.marginBottom = "2px";

    const nameSpan = document.createElement("span");
    nameSpan.className = "amd-gpu-label";
    nameSpan.textContent = label || "GPU";

    nameSpan.style.color = "#ffd27f";

    const tempSpan = document.createElement("span");
    tempSpan.className = "amd-temp-text";
    tempSpan.textContent = "0°C";
    tempSpan.style.color = "#ccc";

    header.appendChild(nameSpan);
    header.appendChild(tempSpan);
    row.appendChild(header);

    // GPU Utilization
    const gpuSection = document.createElement("div");
    gpuSection.style.marginBottom = "3px";

    const gpuLabel = document.createElement("div");
    gpuLabel.textContent = "GPU:";
    gpuLabel.style.marginBottom = "1px";

    const gpuBarContainer = document.createElement("div");
    gpuBarContainer.style.height = "12px";
    gpuBarContainer.style.backgroundColor = "#333";
    gpuBarContainer.style.borderRadius = "3px";
    gpuBarContainer.style.position = "relative";

    const gpuBar = document.createElement("div");
    gpuBar.className = "amd-gpu-utilization-bar";
    gpuBar.style.height = "100%";
    gpuBar.style.width = "0%";
    gpuBar.style.backgroundColor = "#47a0ff";
    gpuBar.style.borderRadius = "3px";
    gpuBar.style.transition = "width 0.5s ease-out, background-color 0.3s";

    const gpuText = document.createElement("div");
    gpuText.className = "amd-gpu-utilization-text";
    gpuText.textContent = "0%";
    gpuText.style.position = "absolute";
    gpuText.style.top = "0";
    gpuText.style.left = "5px";
    gpuText.style.lineHeight = "12px";
    gpuText.style.textShadow = "1px 1px 1px #000";

    gpuBarContainer.appendChild(gpuBar);
    gpuBarContainer.appendChild(gpuText);
    gpuSection.appendChild(gpuLabel);
    gpuSection.appendChild(gpuBarContainer);
    row.appendChild(gpuSection);

    // VRAM Usage
    const vramSection = document.createElement("div");
    vramSection.style.marginBottom = "3px";

    const vramLabel = document.createElement("div");
    vramLabel.textContent = "VRAM:";
    vramLabel.style.marginBottom = "1px";

    const vramBarContainer = document.createElement("div");
    vramBarContainer.style.height = "12px";
    vramBarContainer.style.backgroundColor = "#333";
    vramBarContainer.style.borderRadius = "3px";
    vramBarContainer.style.position = "relative";

    const vramBar = document.createElement("div");
    vramBar.className = "amd-vram-bar";
    vramBar.style.height = "100%";
    vramBar.style.width = "0%";
    vramBar.style.backgroundColor = "#47a0ff";
    vramBar.style.borderRadius = "3px";
    vramBar.style.transition = "width 0.5s ease-out, background-color 0.3s";

    const vramText = document.createElement("div");
    vramText.className = "amd-vram-text";
    vramText.textContent = "0MB / 0MB (0%)";
    vramText.style.position = "absolute";
    vramText.style.top = "0";
    vramText.style.left = "5px";
    vramText.style.lineHeight = "12px";
    vramText.style.textShadow = "1px 1px 1px #000";

    vramBarContainer.appendChild(vramBar);
    vramBarContainer.appendChild(vramText);
    vramSection.appendChild(vramLabel);
    vramSection.appendChild(vramBarContainer);
    row.appendChild(vramSection);

    // Temperature bar (under the header temp value)
    const tempSection = document.createElement("div");

    const tempLabel = document.createElement("div");
    tempLabel.textContent = "Temp:";
    tempLabel.style.marginBottom = "1px";

    const tempBarContainer = document.createElement("div");
    tempBarContainer.style.height = "12px";
    tempBarContainer.style.backgroundColor = "#333";
    tempBarContainer.style.borderRadius = "3px";
    tempBarContainer.style.position = "relative";

    const tempBar = document.createElement("div");
    tempBar.className = "amd-temp-bar";
    tempBar.style.height = "100%";
    tempBar.style.width = "0%";
    tempBar.style.backgroundColor = "#47a0ff";
    tempBar.style.borderRadius = "3px";
    tempBar.style.transition = "width 0.5s ease-out, background-color 0.3s";

    tempBarContainer.appendChild(tempBar);
    tempSection.appendChild(tempLabel);
    tempSection.appendChild(tempBarContainer);
    row.appendChild(tempSection);

    return {
        row,
        nameSpan,
        tempSpan,
        gpuBar,
        gpuText,
        vramBar,
        vramText,
        tempBar
    };
};

// Update a single GPU row with data
const updateGpuRowUI = (rowObj, gpu) => {
    if (!rowObj || !gpu) return;

    const label = gpu.label || gpu.card || `GPU${gpu.index ?? ""}`;
    rowObj.nameSpan.textContent = label;

    // GPU utilization
    const utilization = gpu.gpu_utilization || 0;
    rowObj.gpuBar.style.width = `${utilization}%`;
    rowObj.gpuText.textContent = `${utilization}%`;

    if (utilization > 80) {
        rowObj.gpuBar.style.backgroundColor = '#ff4d4d';  // Red for high
    } else if (utilization > 50) {
        rowObj.gpuBar.style.backgroundColor = '#ffad33';  // Orange for medium
    } else {
        rowObj.gpuBar.style.backgroundColor = '#47a0ff';  // Blue for low
    }

    // VRAM usage
    const vramPercent = gpu.vram_used_percent || 0;
    const vramUsed = gpu.vram_used || 0;
    const vramTotal = gpu.vram_total || 1;

    rowObj.vramBar.style.width = `${vramPercent}%`;

    let vramUsedText = vramUsed;
    let vramTotalText = vramTotal;
    let unit = 'MB';

    if (vramTotal >= 1024) {
        vramUsedText = (vramUsed / 1024).toFixed(1);
        vramTotalText = (vramTotal / 1024).toFixed(1);
        unit = 'GB';
    }

    rowObj.vramText.textContent = `${vramUsedText}${unit} / ${vramTotalText}${unit} (${vramPercent}%)`;

    if (vramPercent > 85) {
        rowObj.vramBar.style.backgroundColor = '#ff4d4d';  // Red for high
    } else if (vramPercent > 70) {
        rowObj.vramBar.style.backgroundColor = '#ffad33';  // Orange for medium
    } else {
        rowObj.vramBar.style.backgroundColor = '#47a0ff';  // Blue for low
    }

    // Temperature
    const temp = gpu.gpu_temperature || 0;
    const tempPercent = Math.min(temp, 100);
    rowObj.tempBar.style.width = `${tempPercent}%`;
    rowObj.tempSpan.textContent = `${temp}°C`;

    if (temp > 80) {
        rowObj.tempBar.style.backgroundColor = '#ff4d4d';  // Red
        rowObj.tempSpan.style.color = '#ff4d4d';
    } else if (temp > 60) {
        rowObj.tempBar.style.backgroundColor = '#ffad33';  // Orange
        rowObj.tempSpan.style.color = '#ffad33';
    } else {
        rowObj.tempBar.style.backgroundColor = '#47a0ff';  // Blue
        rowObj.tempSpan.style.color = '#ccc';
    }
};

// Update the monitor UI with new data
const updateMonitorUI = (monitor, data) => {
    if (!data || !Array.isArray(data.gpus) || data.gpus.length === 0) return;

    // Update driver/platform line
    if (monitor.driverLine) {
        const parts = [];
        if (data.device_type) parts.push(String(data.device_type).toUpperCase());
        if (data.driver) {
            if (data.driver.driver_version) parts.push(data.driver.driver_version);
            if (data.driver.smi_version) parts.push(data.driver.smi_version);
        }
        monitor.driverLine.textContent = parts.join(" · ");
    }

    const gpuRows = monitor.gpuRows || {};
    const list = monitor.gpuList;
    const seenKeys = new Set();

    data.gpus.forEach((gpu, idx) => {
        const key = gpu.card || `gpu${gpu.index ?? idx}`;
        seenKeys.add(key);

        if (!gpuRows[key]) {
            const label = gpu.label || key;
            const rowObj = createGpuRow(label);
            list.appendChild(rowObj.row);
            gpuRows[key] = rowObj;
        }

        updateGpuRowUI(gpuRows[key], gpu);
    });

    // Remove rows for GPUs that disappeared
    Object.keys(gpuRows).forEach((key) => {
        if (!seenKeys.has(key)) {
            const rowObj = gpuRows[key];
            if (rowObj && rowObj.row && rowObj.row.parentNode === list) {
                list.removeChild(rowObj.row);
            }
            delete gpuRows[key];
        }
    });

    monitor.gpuRows = gpuRows;
};

// Main app function
const main = () => {
    // Create the monitor UI
    const monitor = createMonitorElement();
    document.body.appendChild(monitor.container);
    
    // Set up WebSocket listener for GPU updates
    api.addEventListener("amd_gpu_monitor", (event) => {
        updateMonitorUI(monitor, event.detail);
    });
};

// Wait for DOM to be loaded
app.registerExtension({
    name: "amd.gpu.monitor",
    async setup() {
        // Wait a bit for the UI to be fully loaded
        setTimeout(main, 1000);
    },
});
