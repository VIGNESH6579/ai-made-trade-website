const calculateSignal = (optionChainData) => {
  if (!optionChainData || !optionChainData.records) {
    return { error: "Invalid Data format" };
  }

  const records = optionChainData.records;
  const underlyingValue = records.underlyingValue;
  const timestamp = records.timestamp;
  
  // 1. Calculate General Put-Call Ratio
  let totalPE_OI = 0;
  let totalCE_OI = 0;
  
  records.data.forEach(strike => {
    if (strike.PE) totalPE_OI += strike.PE.openInterest;
    if (strike.CE) totalCE_OI += strike.CE.openInterest;
  });

  const pcr = totalCE_OI === 0 ? 0 : (totalPE_OI / totalCE_OI).toFixed(2);

  // 2. Identify ATM Strike Range (+/- 5 strikes) for Convergence Momentum Analysis
  // Find closest strike
  let atmStrike = 0;
  let minDiff = Infinity;
  records.data.forEach(strike => {
    const diff = Math.abs(strike.strikePrice - underlyingValue);
    if (diff < minDiff) {
      minDiff = diff;
      atmStrike = strike.strikePrice;
    }
  });

  const strikeInterval = 50; // NIFTY interval
  const lowerRange = atmStrike - (strikeInterval * 5);
  const upperRange = atmStrike + (strikeInterval * 5);

  let nearTerm_PE_OI_Change = 0;
  let nearTerm_CE_OI_Change = 0;
  
  // Extract Max Pain Estimate
  let maxPainStrike = 0;
  let maxOI = 0;

  let activeStrikesData = [];

  records.data.forEach(strike => {
    if (strike.strikePrice >= lowerRange && strike.strikePrice <= upperRange) {
      if (strike.PE) nearTerm_PE_OI_Change += strike.PE.changeinOpenInterest;
      if (strike.CE) nearTerm_CE_OI_Change += strike.CE.changeinOpenInterest;
      
      const totalStrikeOI = (strike.PE ? strike.PE.openInterest : 0) + (strike.CE ? strike.CE.openInterest : 0);
      if (totalStrikeOI > maxOI) {
        maxOI = totalStrikeOI;
        maxPainStrike = strike.strikePrice;
      }
      
      activeStrikesData.push({
        strikePrice: strike.strikePrice,
        ceOI: strike.CE ? strike.CE.openInterest : 0,
        ceChange: strike.CE ? strike.CE.changeinOpenInterest : 0,
        peOI: strike.PE ? strike.PE.openInterest : 0,
        peChange: strike.PE ? strike.PE.changeinOpenInterest : 0,
        iv: strike.CE ? (strike.CE.impliedVolatility + (strike.PE ? strike.PE.impliedVolatility : 0)) / 2 : 0
      });
    }
  });

  // 3. Signal Calculation Logic (Convergence)
  let action = "HOLD / NEUTRAL";
  let confidence = "LOW";
  let reason = "Market is lacking clear momentum.";
  let strategy = "Stay Out";
  let target = 0;
  let stopLoss = 0;

  const oiMomentumDiff = nearTerm_PE_OI_Change - nearTerm_CE_OI_Change;
  
  if (pcr > 1.2 && oiMomentumDiff > 50000) {
    // Bullish
    action = "BUY CALL";
    confidence = "HIGH";
    reason = `Strong Put writing (Support) detected near ${atmStrike}. PCR is bullish at ${pcr}.`;
    strategy = "Bull Call Spread or Naked ATM Call";
    target = atmStrike + 100;
    stopLoss = atmStrike - 50;
  } else if (pcr < 0.8 && oiMomentumDiff < -50000) {
    // Bearish
    action = "BUY PUT";
    confidence = "HIGH";
    reason = `Strong Call writing (Resistance) detected near ${atmStrike}. PCR is bearish at ${pcr}.`;
    strategy = "Bear Put Spread or Naked ATM Put";
    target = atmStrike - 100;
    stopLoss = atmStrike + 50;
  } else if (pcr > 1.0 && oiMomentumDiff > 10000) {
    action = "BUY CALL";
    confidence = "MEDIUM";
    reason = `Slight bullish bias. Put writers gaining control.`;
    strategy = "Wait for pullback to Buy Call";
    target = atmStrike + 50;
    stopLoss = atmStrike - 30;
  } else if (pcr < 1.0 && oiMomentumDiff < -10000) {
    action = "BUY PUT";
    confidence = "MEDIUM";
    reason = `Slight bearish bias. Call writers gaining control.`;
    strategy = "Wait for bounce to Buy Put";
    target = atmStrike - 50;
    stopLoss = atmStrike + 30;
  }

  return {
    timestamp,
    underlyingValue,
    atmStrike,
    pcr,
    maxPain: maxPainStrike,
    signal: {
      action,
      confidence,
      reason,
      strategy,
      target,
      stopLoss,
      netOiShift: oiMomentumDiff
    },
    strikes: activeStrikesData
  };
};

module.exports = { calculateSignal };
