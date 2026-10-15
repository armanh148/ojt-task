// Retail Mart Z-Report UI Controller (End-of-Day Cashier Reconciliation & Financial Audit)

class ReportsUIController {
    constructor() {
        this.currentReport = null;
        this.history = [];
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadLiveZReport();
        await this.loadHistory();
    }

    bindEvents() {
        const btnRefresh = document.getElementById('btnRefreshZReport');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadLiveZReport());
        }

        const btnCloseDay = document.getElementById('btnCloseCashierDay');
        if (btnCloseDay) {
            btnCloseDay.addEventListener('click', () => this.executeCloseDay());
        }

        const btnPrintZReport = document.getElementById('btnPrintZReport');
        if (btnPrintZReport) {
            btnPrintZReport.addEventListener('click', () => {
                window.print();
            });
        }
    }

    async loadLiveZReport() {
        const res = await API.getCurrentZReport();
        if (res.ok) {
            this.currentReport = res.data.data;
            this.renderZReportView(this.currentReport);
        }
    }

    async loadHistory() {
        const res = await API.getZReportHistory();
        if (res.ok) {
            this.history = res.data.data;
            this.renderHistoryTable(this.history);
        }
    }

    renderZReportView(report) {
        // Populate DOM elements
        const updateText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        updateText('zReportStartTime', new Date(report.start_time).toLocaleString());
        updateText('zReportEndTime', new Date(report.end_time).toLocaleString());
        updateText('zReportTxCount', report.transaction_count);
        updateText('zReportVoidCount', report.void_count);

        updateText('zReportTotalCash', `$${Number(report.total_cash).toFixed(2)}`);
        updateText('zReportTotalCard', `$${Number(report.total_card).toFixed(2)}`);
        updateText('zReportTotalUPI', `$${Number(report.total_upi).toFixed(2)}`);
        updateText('zReportTotalCredit', `$${Number(report.total_credit).toFixed(2)}`);

        updateText('zReportGrossSales', `$${Number(report.gross_sales).toFixed(2)}`);
        updateText('zReportSalesTax', `$${Number(report.total_sales_tax).toFixed(2)}`);
        updateText('zReportDiscounts', `-$${Number(report.total_discounts || 0).toFixed(2)}`);
        updateText('zReportNetSales', `$${Number(report.net_sales).toFixed(2)}`);

        updateText('zReportTotalCOGS', `$${Number(report.total_cogs).toFixed(2)}`);
        updateText('zReportGrossMargin', `$${Number(report.gross_margin).toFixed(2)}`);
        updateText('zReportGrossMarginPct', `${Number(report.gross_margin_percentage).toFixed(1)}%`);
    }

    renderHistoryTable(history) {
        const tbody = document.getElementById('zReportHistoryTableBody');
        if (!tbody) return;

        if (!history || history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem;">No closed Z-Reports archived yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = history.map(h => `
            <tr>
                <td><strong class="font-code">${h.report_number}</strong></td>
                <td>${h.cashier_name}</td>
                <td>${new Date(h.created_at).toLocaleDateString()} ${new Date(h.created_at).toLocaleTimeString()}</td>
                <td><span class="font-code">${h.transaction_count} tx</span></td>
                <td><strong class="font-code" style="color: #60a5fa;">$${Number(h.net_sales).toFixed(2)}</strong></td>
                <td><span class="font-code" style="color: #34d399;">$${Number(h.gross_margin).toFixed(2)} (${h.gross_margin_percentage}%)</span></td>
                <td>$${Number(h.total_cash).toFixed(2)}</td>
            </tr>
        `).join('');
    }

    async executeCloseDay() {
        if (!confirm('Are you sure you want to CLOSE THE CURRENT CASHIER SESSION and archive the official End-of-Day Z-Report?')) {
            return;
        }

        const res = await API.closeZReport('Cashier 1');
        if (res.ok) {
            alert(`✅ Z-Report Generated and Archived!\nReport Number: ${res.data.data.report_number}\nNet Sales: $${res.data.data.net_sales.toFixed(2)}\nGross Margin: $${res.data.data.gross_margin.toFixed(2)}`);
            await this.loadLiveZReport();
            await this.loadHistory();
        } else {
            alert(`Failed to close Z-report: ${res.data.error}`);
        }
    }
}

window.ReportsUIController = ReportsUIController;
