// Hardware Scanner Event Listener & Simulation Engine
// Capable of zero-lag capture of rapid keystrokes (10-15 chars within <50ms delta) + 'Enter'

class BarcodeScannerService {
    constructor() {
        this.buffer = '';
        this.lastKeystrokeTime = 0;
        this.MAX_KEYSTROKE_DELTA_MS = 60; // Max time between keystrokes for hardware scanner
        this.MIN_BARCODE_LENGTH = 4;
        this.listeners = [];
        this.manualInputEl = null;
        this.statusIndicatorEl = null;
        this.latencyDisplayEl = null;

        this.initHardwareListener();
    }

    initElements(manualInputId, statusIndicatorId, latencyDisplayId) {
        this.manualInputEl = document.getElementById(manualInputId);
        this.statusIndicatorEl = document.getElementById(statusIndicatorId);
        this.latencyDisplayEl = document.getElementById(latencyDisplayId);

        // Bind manual input field if present
        if (this.manualInputEl) {
            this.manualInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = this.manualInputEl.value.trim();
                    if (code) {
                        this.handleBarcodeScanned(code, 'MANUAL_INPUT');
                        this.manualInputEl.value = '';
                    }
                }
            });
        }
    }

    initHardwareListener() {
        document.addEventListener('keydown', (e) => {
            // Ignore if active element is an input other than our scanner listener or search
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const activeId = document.activeElement ? document.activeElement.id : '';
            const isScannerInput = activeId === 'scannerInput' || activeId === 'globalSearchInput';

            if (activeTag === 'textarea' || (activeTag === 'input' && !isScannerInput)) {
                return;
            }

            const now = performance.now();
            const delta = now - this.lastKeystrokeTime;
            this.lastKeystrokeTime = now;

            if (e.key === 'Enter') {
                // If buffer has characters and keystroke cadence matched hardware scanner
                if (this.buffer.length >= this.MIN_BARCODE_LENGTH) {
                    e.preventDefault();
                    const scannedCode = this.buffer.trim();
                    this.buffer = '';
                    this.handleBarcodeScanned(scannedCode, 'HARDWARE_SCANNER');
                } else {
                    this.buffer = '';
                }
                return;
            }

            // Only capture printable characters
            if (e.key.length === 1) {
                if (delta > this.MAX_KEYSTROKE_DELTA_MS && this.buffer.length > 0) {
                    // Cadence was too slow for hardware scanner; reset buffer to single char
                    this.buffer = e.key;
                } else {
                    this.buffer += e.key;
                }
            }
        });
    }

    onScan(callback) {
        this.listeners.push(callback);
    }

    handleBarcodeScanned(barcode, source = 'HARDWARE_SCANNER') {
        const scanStart = performance.now();

        // Visual flash indication
        this.triggerVisualFeedback();

        // Dispatch to all registered listeners
        for (const cb of this.listeners) {
            cb({
                barcode,
                source,
                timestamp: Date.now(),
                markEnd: () => Math.round(performance.now() - scanStart)
            });
        }
    }

    triggerVisualFeedback() {
        if (this.statusIndicatorEl) {
            this.statusIndicatorEl.classList.add('scanning');
            setTimeout(() => {
                this.statusIndicatorEl.classList.remove('scanning');
            }, 300);
        }
    }

    updateLatencyBadge(latencyMs) {
        if (this.latencyDisplayEl) {
            this.latencyDisplayEl.textContent = `⚡ ${latencyMs}ms`;
            if (latencyMs < 150) {
                this.latencyDisplayEl.style.color = '#34d399'; // Meets <150ms SLA!
            } else {
                this.latencyDisplayEl.style.color = '#fbbf24';
            }
        }
    }

    // Virtual Hardware Scanner Simulator for trainee evaluation
    simulateHardwareScan(barcode) {
        let i = 0;
        this.buffer = '';
        const interval = setInterval(() => {
            if (i < barcode.length) {
                const char = barcode[i];
                const event = new KeyboardEvent('keydown', { key: char, bubbles: true });
                document.dispatchEvent(event);
                i++;
            } else {
                clearInterval(interval);
                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                document.dispatchEvent(enterEvent);
            }
        }, 15); // Emulates 15ms per character hardware scanner speed
    }
}

window.BarcodeScanner = new BarcodeScannerService();
