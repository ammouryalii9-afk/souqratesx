import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

type VaultContextType = {
  userId: string;
  username: string;
  totalBalanceUSD: number;
  tempMiningPoints: number;
  miningLevel: number;
  energy: number;
  maxEnergy: number;
  totalReferrals: number;
  referralEarnings: number;
  
  setTotalBalanceUSD: (val: number | ((prev: number) => number)) => void;
  setTempMiningPoints: (val: number | ((prev: number) => number)) => void;
  setMiningLevel: (val: number | ((prev: number) => number)) => void;
  setEnergy: (val: number | ((prev: number) => number)) => void;
  setMaxEnergy: (val: number | ((prev: number) => number)) => void;
  
  claimEarnings: () => void;
  upgradeMiningLevel: (cost: number, newLevel: number) => void;
  expandBattery: (cost: number) => void;
  tapMine: () => number;
};

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId] = useState('user_123');
  const [username] = useState('CryptoMiner');
  const [totalBalanceUSD, setTotalBalanceUSD] = useState(() => Number(localStorage.getItem('totalBalanceUSD')) || 12.45);
  const [tempMiningPoints, setTempMiningPoints] = useState(() => Number(localStorage.getItem('tempMiningPoints')) || 14850);
  const [miningLevel, setMiningLevel] = useState(() => Number(localStorage.getItem('miningLevel')) || 1);
  const [energy, setEnergy] = useState(() => Number(localStorage.getItem('energy')) || 85);
  const [maxEnergy, setMaxEnergy] = useState(() => Number(localStorage.getItem('maxEnergy')) || 100);
  const [totalReferrals] = useState(14);
  const [referralEarnings] = useState(1.50);

  // Persistence
  useEffect(() => {
    localStorage.setItem('totalBalanceUSD', totalBalanceUSD.toString());
    localStorage.setItem('tempMiningPoints', tempMiningPoints.toString());
    localStorage.setItem('miningLevel', miningLevel.toString());
    localStorage.setItem('energy', energy.toString());
    localStorage.setItem('maxEnergy', maxEnergy.toString());
  }, [totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy]);

  // Mining logic
  useEffect(() => {
    const miningCap = miningLevel === 1 ? 360 : miningLevel === 2 ? 1800 : miningLevel === 3 ? 7200 : 36000;
    
    const interval = setInterval(() => {
      setEnergy((prevEnergy) => {
        setTempMiningPoints((prevPoints) => {
          if (prevEnergy > 0 && prevPoints < miningCap) {
            const addedPoints = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;
            return Math.min(prevPoints + addedPoints, miningCap);
          }
          return prevPoints;
        });
        
        return prevEnergy > 0 && tempMiningPoints < miningCap ? prevEnergy - 1 : prevEnergy;
      });
    }, 30000); // 30s
    
    return () => clearInterval(interval);
  }, [miningLevel, tempMiningPoints]);

  // Energy regen
  useEffect(() => {
    const checkRegen = () => {
      const lastRegen = Number(localStorage.getItem('lastEnergyRegen')) || Date.now();
      const now = Date.now();
      const diffMinutes = Math.floor((now - lastRegen) / 60000);
      
      if (diffMinutes >= 15) {
        const intervals = Math.floor(diffMinutes / 15);
        setEnergy(prev => Math.min(maxEnergy, prev + (5 * intervals)));
        localStorage.setItem('lastEnergyRegen', (lastRegen + intervals * 15 * 60000).toString());
      } else if (!localStorage.getItem('lastEnergyRegen')) {
        localStorage.setItem('lastEnergyRegen', now.toString());
      }
    };
    
    checkRegen(); // initial check
    const regenInterval = setInterval(checkRegen, 60000); // Check every minute
    
    return () => clearInterval(regenInterval);
  }, [maxEnergy]);

  const claimEarnings = () => {
    const usdToAdd = (tempMiningPoints / 10000) * 0.01; // 10,000 pts = $0.01
    setTotalBalanceUSD(prev => prev + usdToAdd);
    setTempMiningPoints(0);
  };

  const upgradeMiningLevel = (cost: number, newLevel: number) => {
    if (tempMiningPoints >= cost) {
      setTempMiningPoints(prev => prev - cost);
      setMiningLevel(newLevel);
    }
  };

  const expandBattery = (cost: number) => {
    if (tempMiningPoints >= cost && maxEnergy < 200) {
      setTempMiningPoints(prev => prev - cost);
      setMaxEnergy(200);
    }
  };

  // Tap to mine — each tap adds points and costs 1 energy
  // Returns the points earned (0 if no energy), used by UI for floating animation
  const tapMine = (): number => {
    let earned = 0;
    setEnergy(prev => {
      if (prev <= 0) return prev;
      const pts = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;
      earned = pts;
      setTempMiningPoints(p => {
        const cap = miningLevel === 1 ? 360 : miningLevel === 2 ? 1800 : miningLevel === 3 ? 7200 : 36000;
        return Math.min(p + pts, cap);
      });
      return prev - 1;
    });
    return earned;
  };

  return (
    <VaultContext.Provider
      value={{
        userId,
        username,
        totalBalanceUSD,
        tempMiningPoints,
        miningLevel,
        energy,
        maxEnergy,
        totalReferrals,
        referralEarnings,
        setTotalBalanceUSD,
        setTempMiningPoints,
        setMiningLevel,
        setEnergy,
        setMaxEnergy,
        claimEarnings,
        upgradeMiningLevel,
        expandBattery,
        tapMine
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};
