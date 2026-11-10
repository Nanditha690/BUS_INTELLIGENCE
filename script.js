
"use strict";

/* =========================================================
   BUS INTELLIGENCE DASHBOARD
   CSV file: data/Ticket_data.csv
   Libraries: PapaParse and Chart.js
   ========================================================= */


/* 1. CONFIGURATION */

const CSV_FILE = "data/Ticket_data.csv";

const REQUIRED_COLUMNS = [
    "Waybill Number",
    "Ticket Number",
    "From Stop",
    "To Stop",
    "Date",
    "Time",
    "Total Psgr",
    "Coll Amt",
    "Uncoll Amt"
];

const TABLE_COLUMNS = [...REQUIRED_COLUMNS];

const CHART_IDS = [
    "dailyCollectionChart",
    "revenueComparisonChart",
    "boardingStopsChart",
    "destinationChart",
    "routeCombinationChart",
    "lowDemandChart",
    "passengerStopChart",
    "hourlyDemandChart",
    "waybillChart",
    "collectionComparisonChart",
    "unusualCollectionChart",
    "collectionPerformanceChart"
];

let dashboardData = [];
let dashboardCharts = {};


/* 2. GENERAL HELPERS */

function normalizeHeader(value) {
    return String(value ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


function getColumn(row, possibleNames) {
    if (!row || typeof row !== "object") {
        return "";
    }

    const rowKeys = Object.keys(row);

    for (const name of possibleNames) {
        const wanted = normalizeHeader(name);

        const actualKey = rowKeys.find(
            key => normalizeHeader(key) === wanted
        );

        if (actualKey !== undefined) {
            return row[actualKey];
        }
    }

    return "";
}


function parseNumber(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    let text = String(value).trim();

    if (!text) {
        return 0;
    }

    // Handle values such as (1,250.50)
    const isNegative = /^\(.*\)$/.test(text);

    text = text
        .replace(/[₹$€£,\s]/g, "")
        .replace(/[()]/g, "")
        .replace(/[^\d.-]/g, "");

    const number = Number(text);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return isNegative ? -Math.abs(number) : number;
}


function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}


function formatNumber(value) {
    return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}


function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


function sumValues(records, property) {
    return records.reduce(
        (total, record) => total + (Number(record[property]) || 0),
        0
    );
}


function countBy(records, property) {
    const result = {};

    records.forEach(record => {
        const key = String(record[property] || "Unknown").trim();

        if (!key) {
            return;
        }

        result[key] = (result[key] || 0) + 1;
    });

    return result;
}


function sumBy(records, groupProperty, valueProperty) {
    const result = {};

    records.forEach(record => {
        const key = String(record[groupProperty] || "Unknown").trim();

        if (!key) {
            return;
        }

        result[key] = (result[key] || 0) +
            (Number(record[valueProperty]) || 0);
    });

    return result;
}


function topEntries(object, limit = 10, ascending = false) {
    return Object.entries(object)
        .sort((a, b) => ascending ? a[1] - b[1] : b[1] - a[1])
        .slice(0, limit);
}


/* 3. DATE HELPERS */

function parseDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    // Already a valid Date
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    // Excel serial date support
    if (typeof value === "number" && value > 20000 && value < 80000) {
        const excelDate = new Date(
            Date.UTC(1899, 11, 30) + value * 86400000
        );

        return new Date(
            excelDate.getUTCFullYear(),
            excelDate.getUTCMonth(),
            excelDate.getUTCDate()
        );
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    // YYYY-MM-DD or YYYY/MM/DD
    let match = text.match(
        /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/
    );

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        return makeValidDate(year, month, day);
    }

    // DD-MM-YYYY or DD/MM/YYYY
    match = text.match(
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/
    );

    if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = Number(match[3]);

        // Treat as DD/MM/YYYY by default.
        // If the first number is greater than 12, it must be the day.
        // If the second number is greater than 12, treat it as MM/DD/YYYY.
        let day = first;
        let month = second;

        if (first <= 12 && second > 12) {
            month = first;
            day = second;
        }

        return makeValidDate(year, month, day);
    }

    // Last attempt for other browser-recognized date formats
    const parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
        return new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate()
        );
    }

    return null;
}


function makeValidDate(year, month, day) {
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}


function getDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleDateString("en-IN");
}


/* 4. TIME HELPERS */

function parseHour(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    // Excel time stored as a fraction of a day
    if (typeof value === "number" && value >= 0 && value < 1) {
        return Math.floor(value * 24);
    }

    const text = String(value).trim().toUpperCase();

    if (!text) {
        return null;
    }

    // 12-hour format, such as 02:30 PM
    const twelveHour = text.match(
        /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/
    );

    if (twelveHour) {
        let hour = Number(twelveHour[1]);
        const period = twelveHour[3];

        if (hour < 1 || hour > 12) {
            return null;
        }

        if (period === "AM" && hour === 12) {
            hour = 0;
        } else if (period === "PM" && hour !== 12) {
            hour += 12;
        }

        return hour;
    }

    // 24-hour format, such as 14:30 or 14:30:00
    const twentyFourHour = text.match(
        /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

    if (twentyFourHour) {
        const hour = Number(twentyFourHour[1]);
        const minute = Number(twentyFourHour[2]);

        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return hour;
        }

        return null;
    }

    // A value containing only an hour, such as 14
    if (/^\d{1,2}$/.test(text)) {
        const hour = Number(text);

        return hour >= 0 && hour <= 23 ? hour : null;
    }

    return null;
}


function formatHour(hour) {
    if (hour === null || hour === undefined) {
        return "Unknown";
    }

    return `${String(hour).padStart(2, "0")}:00`;
}


/* 5. LOAD CSV FILE */

function loadCSV() {
    showMessage("Loading your bus ticket dataset...", "info");

    if (typeof Papa === "undefined") {
        showMessage(
            "PapaParse could not be loaded. Check your internet connection and the PapaParse script in index.html.",
            "error"
        );
        return;
    }

    Papa.parse(CSV_FILE, {
        download: true,
        header: true,
        skipEmptyLines: "greedy",
        dynamicTyping: false,

        complete: function (results) {
            if (results.errors && results.errors.length > 0) {
                console.warn("CSV parsing warnings:", results.errors);
            }

            if (!results.data || results.data.length === 0) {
                showMessage(
                    "The CSV file loaded, but it contains no data rows.",
                    "error"
                );
                return;
            }

            processCSV(results.data);
        },

        error: function (error) {
            console.error("CSV loading error:", error);

            showMessage(
                "Unable to load data/Ticket_data.csv. Check the file name, folder location, and Live Server.",
                "error"
            );
        }
    });
}


/* 6. PROCESS CSV DATA */

function processCSV(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        showMessage("No usable CSV records were found.", "error");
        return;
    }

    const actualHeaders = Object.keys(rows[0] || {});
    const normalizedHeaders = actualHeaders.map(normalizeHeader);

    const missingColumns = REQUIRED_COLUMNS.filter(
        column => !normalizedHeaders.includes(normalizeHeader(column))
    );

    if (missingColumns.length > 0) {
        showMessage(
            "CSV header mismatch. Missing columns: " +
            missingColumns.join(", "),
            "error"
        );

        console.error("CSV headers found:", actualHeaders);
        return;
    }

    dashboardData = rows.map(row => {
        const dateValue = getColumn(row, ["Date"]);
        const timeValue = getColumn(row, ["Time"]);

        const fromValue = String(
            getColumn(row, ["From Stop"]) ?? ""
        ).trim();

        const toValue = String(
            getColumn(row, ["To Stop"]) ?? ""
        ).trim();

        return {
            waybill: String(
                getColumn(row, ["Waybill Number"]) ?? ""
            ).trim(),

            ticket: String(
                getColumn(row, ["Ticket Number"]) ?? ""
            ).trim(),

            from: fromValue || "Unknown",

            to: toValue || "Unknown",

            date: parseDate(dateValue),

            time: String(timeValue ?? "").trim(),

            hour: parseHour(timeValue),

            passengers: parseNumber(
                getColumn(row, ["Total Psgr"])
            ),

            collected: parseNumber(
                getColumn(row, ["Coll Amt"])
            ),

            uncollected: parseNumber(
                getColumn(row, ["Uncoll Amt"])
            )
        };
    }).filter(record => {
        return (
            record.waybill ||
            record.ticket ||
            record.from !== "Unknown" ||
            record.to !== "Unknown" ||
            record.passengers !== 0 ||
            record.collected !== 0 ||
            record.uncollected !== 0
        );
    });

    if (dashboardData.length === 0) {
        showMessage(
            "The CSV was read, but no usable records were found. Check the data rows.",
            "error"
        );
        return;
    }

    console.log("CSV loaded successfully.");
    console.log("Number of usable records:", dashboardData.length);
    console.log("First processed record:", dashboardData[0]);

    showMessage(
        `Successfully loaded ${formatNumber(dashboardData.length)} ticket records.`,
        "success"
    );

    updateDashboard();
}


/* 7. UPDATE COMPLETE DASHBOARD */

function updateDashboard() {
    updateKPIs();
    updateAllCharts();
    displayDataTable();
}


/* 8. UPDATE KPI CARDS */

function updateKPIs() {
    const totalCollected = sumValues(dashboardData, "collected");
    const totalUncollected = sumValues(dashboardData, "uncollected");

    const totalRevenue = totalCollected + totalUncollected;
    const totalPassengers = sumValues(dashboardData, "passengers");

    const collectionPercentage = totalRevenue > 0
        ? (totalCollected / totalRevenue) * 100
        : 0;

    const uncollectedPercentage = totalRevenue > 0
        ? (totalUncollected / totalRevenue) * 100
        : 0;

    const hourTotals = {};

    dashboardData.forEach(record => {
        if (record.hour !== null) {
            hourTotals[record.hour] =
                (hourTotals[record.hour] || 0) + record.passengers;
        }
    });

    let peakHour = "N/A";
    const hourEntries = Object.entries(hourTotals);

    if (hourEntries.length > 0) {
        hourEntries.sort((a, b) => Number(b[1]) - Number(a[1]));
        peakHour = formatHour(Number(hourEntries[0][0]));
    }

    setText("totalRevenue", formatCurrency(totalRevenue));
    setText("totalUncollected", formatCurrency(totalUncollected));
    setText("collectionPercentage", `${collectionPercentage.toFixed(2)}%`);
    setText("totalPassengers", formatNumber(totalPassengers));

    setText("amountCollected", formatCurrency(totalCollected));
    setText("amountUncollected", formatCurrency(totalUncollected));
    setText(
        "revenueCollectionPercentage",
        `${collectionPercentage.toFixed(2)}%`
    );

    setText("passengerCount", formatNumber(totalPassengers));
    setText("peakTravelHour", peakHour);

    console.log("KPI summary:", {
        totalRevenue,
        totalCollected,
        totalUncollected,
        totalPassengers,
        collectionPercentage,
        uncollectedPercentage,
        peakHour
    });
}


/* 9. CHART HELPERS */

function createChart(canvasId, type, labels, datasets, options = {}) {
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        console.warn(`Chart canvas not found: ${canvasId}`);
        return;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js is not loaded.");
        return;
    }

    // Destroy old chart before drawing a replacement
    if (dashboardCharts[canvasId]) {
        dashboardCharts[canvasId].destroy();
    }

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: "bottom"
            }
        },
        scales: type === "pie" || type === "doughnut"
            ? {}
            : {
                y: {
                    beginAtZero: true
                }
            }
    };

    dashboardCharts[canvasId] = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets
        },
        options: {
            ...defaultOptions,
            ...options
        }
    });
}


function chartDataset(label, data, extra = {}) {
    return {
        label,
        data,
        borderWidth: 2,
        ...extra
    };
}


function getSortedDateEntries(property) {
    const totals = {};

    dashboardData.forEach(record => {
        if (!record.date) {
            return;
        }

        const key = getDateKey(record.date);

        totals[key] = (totals[key] || 0) +
            (Number(record[property]) || 0);
    });

    return Object.entries(totals).sort(
        (a, b) => a[0].localeCompare(b[0])
    );
}


/* 10. DAILY COLLECTION CHART */

function updateDailyCollectionChart() {
    const entries = getSortedDateEntries("collected");

    createChart(
        "dailyCollectionChart",
        "line",
        entries.map(item => item[0]),
        [
            chartDataset("Amount Collected", entries.map(item => item[1]), {
                tension: 0.3,
                fill: false
            })
        ]
    );
}


/* 11. REVENUE COMPARISON CHART */

function updateRevenueComparisonChart() {
    const collected = sumValues(dashboardData, "collected");
    const uncollected = sumValues(dashboardData, "uncollected");

    createChart(
        "revenueComparisonChart",
        "doughnut",
        ["Collected Amount", "Uncollected Amount"],
        [
            chartDataset("Revenue", [collected, uncollected])
        ]
    );
}


/* 12. BOARDING STOPS CHART */

function updateBoardingStopsChart() {
    const totals = sumBy(dashboardData, "from", "passengers");
    const entries = topEntries(totals, 10);

    createChart(
        "boardingStopsChart",
        "bar",
        entries.map(item => item[0]),
        [
            chartDataset("Passengers", entries.map(item => item[1]))
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 13. DESTINATION CHART */

function updateDestinationChart() {
    const totals = sumBy(dashboardData, "to", "passengers");
    const entries = topEntries(totals, 10);

    createChart(
        "destinationChart",
        "bar",
        entries.map(item => item[0]),
        [
            chartDataset("Passengers", entries.map(item => item[1]))
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 14. ROUTE COMBINATION CHART */

function updateRouteCombinationChart() {
    const routes = {};

    dashboardData.forEach(record => {
        const route = `${record.from} → ${record.to}`;

        routes[route] = (routes[route] || 0) + record.passengers;
    });

    const entries = topEntries(routes, 10);

    createChart(
        "routeCombinationChart",
        "bar",
        entries.map(item => item[0]),
        [
            chartDataset("Passengers", entries.map(item => item[1]))
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 15. LOW DEMAND CHART */

function updateLowDemandChart() {
    const routes = {};

    dashboardData.forEach(record => {
        const route = `${record.from} → ${record.to}`;

        routes[route] = (routes[route] || 0) + record.passengers;
    });

    const entries = topEntries(routes, 10, true);

    createChart(
        "lowDemandChart",
        "bar",
        entries.map(item => item[0]),
        [
            chartDataset("Passengers", entries.map(item => item[1]))
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 16. PASSENGER STOP CHART */

function updatePassengerStopChart() {
    const boarding = sumBy(dashboardData, "from", "passengers");
    const destination = sumBy(dashboardData, "to", "passengers");

    const stops = new Set([
        ...Object.keys(boarding),
        ...Object.keys(destination)
    ]);

    const entries = [...stops].map(stop => ({
        stop,
        boarding: boarding[stop] || 0,
        destination: destination[stop] || 0
    }));

    entries.sort(
        (a, b) =>
            (b.boarding + b.destination) -
            (a.boarding + a.destination)
    );

    const selected = entries.slice(0, 10);

    createChart(
        "passengerStopChart",
        "bar",
        selected.map(item => item.stop),
        [
            chartDataset(
                "Boarding Passengers",
                selected.map(item => item.boarding)
            ),
            chartDataset(
                "Destination Passengers",
                selected.map(item => item.destination)
            )
        ]
    );
}


/* 17. HOURLY DEMAND CHART */

function updateHourlyDemandChart() {
    const hourlyTotals = Array(24).fill(0);

    dashboardData.forEach(record => {
        if (record.hour !== null) {
            hourlyTotals[record.hour] += record.passengers;
        }
    });

    createChart(
        "hourlyDemandChart",
        "line",
        Array.from({ length: 24 }, (_, hour) => formatHour(hour)),
        [
            chartDataset("Passengers", hourlyTotals, {
                tension: 0.3,
                fill: false
            })
        ]
    );
}


/* 18. WAYBILL CHART */

function updateWaybillChart() {
    const totals = sumBy(dashboardData, "waybill", "collected");
    const entries = topEntries(totals, 10);

    createChart(
        "waybillChart",
        "bar",
        entries.map(item => item[0]),
        [
            chartDataset("Amount Collected", entries.map(item => item[1]))
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 19. COLLECTION COMPARISON CHART */

function updateCollectionComparisonChart() {
    const collected = {};
    const uncollected = {};

    dashboardData.forEach(record => {
        if (!record.date) {
            return;
        }

        const key = getDateKey(record.date);

        collected[key] = (collected[key] || 0) + record.collected;
        uncollected[key] = (uncollected[key] || 0) + record.uncollected;
    });

    const dates = Object.keys(collected).sort();

    createChart(
        "collectionComparisonChart",
        "bar",
        dates,
        [
            chartDataset(
                "Collected",
                dates.map(date => collected[date] || 0)
            ),
            chartDataset(
                "Uncollected",
                dates.map(date => uncollected[date] || 0)
            )
        ]
    );
}


/* 20. UNUSUAL COLLECTION CHART */

function updateUnusualCollectionChart() {
    const totals = sumBy(dashboardData, "waybill", "collected");
    const entries = Object.entries(totals);

    if (entries.length === 0) {
        createChart(
            "unusualCollectionChart",
            "bar",
            [],
            [chartDataset("Amount Collected", [])]
        );
        return;
    }

    const values = entries.map(item => item[1]);
    const average = values.reduce((a, b) => a + b, 0) / values.length;

    const variance = values.reduce(
        (total, value) => total + Math.pow(value - average, 2),
        0
    ) / values.length;

    const standardDeviation = Math.sqrt(variance);

    const unusual = entries
        .filter(item =>
            standardDeviation === 0 ||
            Math.abs(item[1] - average) >= standardDeviation * 2
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    createChart(
        "unusualCollectionChart",
        "bar",
        unusual.map(item => item[0]),
        [
            chartDataset(
                "Unusual Amount Collected",
                unusual.map(item => item[1])
            )
        ],
        {
            indexAxis: "y"
        }
    );
}


/* 21. COLLECTION PERFORMANCE CHART */

function updateCollectionPerformanceChart() {
    const collected = {};
    const uncollected = {};

    dashboardData.forEach(record => {
        if (!record.date) {
            return;
        }

        const key = getDateKey(record.date);

        collected[key] = (collected[key] || 0) + record.collected;
        uncollected[key] = (uncollected[key] || 0) + record.uncollected;
    });

    const dates = Object.keys(collected).sort();

    const percentages = dates.map(date => {
        const total =
            (collected[date] || 0) + (uncollected[date] || 0);

        return total > 0
            ? ((collected[date] || 0) / total) * 100
            : 0;
    });

    createChart(
        "collectionPerformanceChart",
        "line",
        dates,
        [
            chartDataset("Collection Percentage", percentages, {
                tension: 0.3,
                fill: false
            })
        ],
        {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`
                    }
                }
            }
        }
    );
}


/* 22. UPDATE ALL CHARTS */

function updateAllCharts() {
    if (typeof Chart === "undefined") {
        showMessage(
            "Chart.js is not loaded. Check the Chart.js CDN script in index.html.",
            "error"
        );
        return;
    }

    updateDailyCollectionChart();
    updateRevenueComparisonChart();
    updateBoardingStopsChart();
    updateDestinationChart();
    updateRouteCombinationChart();
    updateLowDemandChart();
    updatePassengerStopChart();
    updateHourlyDemandChart();
    updateWaybillChart();
    updateCollectionComparisonChart();
    updateUnusualCollectionChart();
    updateCollectionPerformanceChart();
}


/* 23. DISPLAY CSV DATA TABLE */

function displayDataTable() {
    const table = document.getElementById("dataTable");

    if (!table) {
        console.warn("Table with id 'dataTable' was not found.");
        return;
    }

    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    if (!thead || !tbody) {
        console.warn("The data table needs both thead and tbody.");
        return;
    }

    thead.innerHTML = "";
    tbody.innerHTML = "";

    const headerRow = document.createElement("tr");

    TABLE_COLUMNS.forEach(column => {
        const th = document.createElement("th");
        th.textContent = column;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    // Show at most the first 100 records for browser performance
    const visibleRows = dashboardData.slice(0, 100);

    visibleRows.forEach(record => {
        const row = document.createElement("tr");

        const values = [
            record.waybill,
            record.ticket,
            record.from,
            record.to,
            formatDate(record.date),
            record.time,
            formatNumber(record.passengers),
            formatCurrency(record.collected),
            formatCurrency(record.uncollected)
        ];

        values.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    if (dashboardData.length > 100) {
        console.info(
            `Showing first 100 of ${dashboardData.length} records in the table.`
        );
    }
}


/* 24. DISPLAY STATUS AND ERROR MESSAGES */

function showMessage(message, type = "info") {
    let messageBox = document.getElementById("dashboardMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "dashboardMessage";

        messageBox.style.padding = "10px 14px";
        messageBox.style.margin = "10px 0";
        messageBox.style.borderRadius = "6px";
        messageBox.style.fontSize = "14px";

        const main = document.querySelector("main") ||
            document.querySelector(".main-content") ||
            document.body;

        main.prepend(messageBox);
    }

    messageBox.textContent = message;

    if (type === "error") {
        messageBox.style.backgroundColor = "#fee2e2";
        messageBox.style.color = "#991b1b";
    } else if (type === "success") {
        messageBox.style.backgroundColor = "#dcfce7";
        messageBox.style.color = "#166534";
    } else {
        messageBox.style.backgroundColor = "#dbeafe";
        messageBox.style.color = "#1e40af";
    }
}


/* 25. START DASHBOARD */

document.addEventListener("DOMContentLoaded", function () {
    console.log("Bus Intelligence Dashboard starting...");

    loadCSV();
});