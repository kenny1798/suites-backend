// utils/billingAnchor.js
exports.firstOfNextMonthTs = () => {
    const now = new Date();
    const ts = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0);
    return Math.floor(ts / 1000);
  };
  