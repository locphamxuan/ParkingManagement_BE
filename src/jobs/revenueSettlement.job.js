/**
 * revenueSettlement.job.js
 * Tự động trích 30% doanh thu mỗi ngày của từng building → ví admin (SystemWallet).
 *
 * Server không chạy 24/7 (máy dev) nên thay vì 1 cron cố định lúc nửa đêm, ta:
 *  - Chạy catch-up khi server khởi động (trích mọi ngày đã qua chưa được trích).
 *  - Lặp lại mỗi 1 giờ (setInterval) để ngày hôm trước được trích sớm sau nửa đêm.
 *
 * Idempotent: settleDailyRevenue() bỏ qua (no-op) nếu (building, ngày) đã trích.
 */

const Building = require('../models/building/Building');
const buildingWalletService = require('../services/manager/buildingWallet.service');

const LOOKBACK_DAYS = 60; // chỉ quét tối đa 60 ngày gần nhất khi catch-up
const INTERVAL_MS = 60 * 60 * 1000; // 1 giờ

let isRunning = false;
let timer = null;

const pad2 = (n) => String(n).padStart(2, '0');
const localDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Trích tất cả các ngày đã hoàn tất (từ hôm qua trở về trước) chưa được trích.
 * Không trích ngày hôm nay vì còn đang phát sinh doanh thu.
 */
const settlePastDueDays = async () => {
  if (isRunning) return;
  isRunning = true;

  let settledCount = 0;
  let transferredTotal = 0;

  try {
    const buildings = await Building.find({}).select('_id').lean();
    if (buildings.length === 0) return;

    // Danh sách các ngày cần xét: hôm qua → hôm qua - (LOOKBACK_DAYS-1)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayKeys = [];
    for (let i = 1; i <= LOOKBACK_DAYS; i += 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dayKeys.push(localDayKey(d));
    }

    for (const building of buildings) {
      for (const dayKey of dayKeys) {
        try {
          const { settlement, alreadySettled } = await buildingWalletService.settleDailyRevenue(
            building._id,
            dayKey,
          );
          if (!alreadySettled && settlement) {
            settledCount += 1;
            transferredTotal += settlement.transferredAmount || 0;
          }
        } catch (err) {
          console.error(
            `[RevenueSettlement] failed building=${building._id} day=${dayKey}:`,
            err.message,
          );
        }
      }
    }

    if (settledCount > 0) {
      console.log(
        `[RevenueSettlement] settled ${settledCount} building-day(s), transferred ${transferredTotal.toLocaleString('en-US')} VND to admin wallet`,
      );
    }
  } catch (err) {
    console.error('[RevenueSettlement] run error:', err.message);
  } finally {
    isRunning = false;
  }
};

/**
 * Khởi động scheduler: chạy catch-up ngay + lặp lại mỗi giờ.
 */
const start = () => {
  // Catch-up khi khởi động (không chặn server start)
  settlePastDueDays();

  if (!timer) {
    timer = setInterval(settlePastDueDays, INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref(); // không giữ process sống
  }
  console.log('[RevenueSettlement] scheduler started (catch-up on boot + hourly)');
};

const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { start, stop, settlePastDueDays };
