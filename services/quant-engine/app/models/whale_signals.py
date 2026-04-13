"""
Whale Signal Analysis Module

Detects accumulation/distribution patterns from top wallet activity.
Generates buy/sell signals when multiple whales move on the same token.
"""

from typing import List, Dict, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from enum import Enum


class SignalType(str, Enum):
    ACCUMULATION = "accumulation"  # Multiple whales buying
    DISTRIBUTION = "distribution"  # Multiple whales selling
    WHALE_BUY = "whale_buy"  # Single top whale buying
    WHALE_SELL = "whale_sell"  # Single top whale selling


class Recommendation(str, Enum):
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    HOLD = "hold"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


class WhaleTransaction(BaseModel):
    """Represents a single whale transaction"""

    walletAddress: str
    walletRank: int  # 1 = highest portfolio
    portfolioValue: float
    tokenAddress: str
    action: str  # "buy" or "sell"
    amountUsd: float
    timestamp: datetime


class WhaleSignal(BaseModel):
    """Generated signal from whale activity"""

    tokenAddress: str
    chainId: int
    signalType: SignalType
    whaleCount: int  # Number of whales involved
    totalVolumeUsd: float
    avgConfidence: float  # 0-1 confidence score
    recommendation: Recommendation
    targetPriceUsd: Optional[float] = None
    stopLossUsd: Optional[float] = None
    reasoning: str
    detectedAt: datetime
    windowStart: datetime
    windowEnd: datetime


def calculate_whale_weight(rank: int, portfolioValue: float) -> float:
    """
    Calculate influence weight for a whale based on rank and portfolio size.

    Higher rank (lower number) = higher weight
    Larger portfolio = higher weight

    Returns: float between 0 and 1
    """
    # Rank weight: top 5 get highest weight
    rank_weight = 1.0 / (rank**0.5) if rank <= 10 else 1.0 / (rank**0.8)

    # Portfolio weight: normalize to 0-1 scale (assume max $1B portfolio)
    portfolio_weight = min(portfolioValue / 1_000_000_000, 1.0)

    # Combined weight (70% rank, 30% portfolio)
    return 0.7 * rank_weight + 0.3 * portfolio_weight


def detect_accumulation_pattern(
    transactions: List[WhaleTransaction], time_window_hours: int = 24
) -> Optional[WhaleSignal]:
    """
    Detect whale accumulation pattern.

    Triggers when 3+ whales buy the same token within time window.
    Higher confidence if top-ranked whales are involved.

    Args:
        transactions: List of whale buy transactions for a token
        time_window_hours: Time window to look for clustering (default 24h)

    Returns:
        WhaleSignal if pattern detected, None otherwise
    """
    if len(transactions) < 3:
        return None

    # Sort by timestamp
    transactions = sorted(transactions, key=lambda t: t.timestamp)

    # Check if transactions cluster within time window
    window_start = transactions[0].timestamp
    window_end = window_start + timedelta(hours=time_window_hours)

    # Count whales within window
    whales_in_window = [t for t in transactions if t.timestamp <= window_end]

    if len(whales_in_window) < 3:
        return None

    # Calculate metrics
    total_volume = sum(t.amountUsd for t in whales_in_window)
    whale_count = len(set(t.walletAddress for t in whales_in_window))

    # Calculate confidence score
    confidence_scores = []
    for tx in whales_in_window:
        whale_weight = calculate_whale_weight(tx.walletRank, tx.portfolioValue)
        # Also consider transaction size
        size_factor = min(tx.amountUsd / 1_000_000, 1.0)  # Normalize to $1M
        confidence = whale_weight * 0.7 + size_factor * 0.3
        confidence_scores.append(confidence)

    avg_confidence = sum(confidence_scores) / len(confidence_scores)

    # Determine recommendation based on confidence
    if avg_confidence >= 0.8:
        recommendation = Recommendation.STRONG_BUY
    elif avg_confidence >= 0.6:
        recommendation = Recommendation.BUY
    else:
        recommendation = Recommendation.HOLD

    # Generate reasoning
    top_whale_ranks = sorted([t.walletRank for t in whales_in_window])[:3]
    reasoning = f"{whale_count} whales accumulated ${total_volume:,.0f} in {time_window_hours}h. Top participants: ranks {top_whale_ranks}. Confidence: {avg_confidence:.2%}"

    return WhaleSignal(
        tokenAddress=transactions[0].tokenAddress,
        chainId=1,  # TODO: Get from transaction
        signalType=SignalType.ACCUMULATION,
        whaleCount=whale_count,
        totalVolumeUsd=total_volume,
        avgConfidence=avg_confidence,
        recommendation=recommendation,
        targetPriceUsd=None,  # TODO: Calculate based on historical patterns
        stopLossUsd=None,  # TODO: Calculate based on risk tolerance
        reasoning=reasoning,
        detectedAt=datetime.now(),
        windowStart=window_start,
        windowEnd=window_end,
    )


def detect_distribution_pattern(
    transactions: List[WhaleTransaction], time_window_hours: int = 24
) -> Optional[WhaleSignal]:
    """
    Detect whale distribution pattern (mass selling).

    Triggers when 3+ whales sell the same token within time window.
    This is a bearish signal.
    """
    if len(transactions) < 3:
        return None

    transactions = sorted(transactions, key=lambda t: t.timestamp)
    window_start = transactions[0].timestamp
    window_end = window_start + timedelta(hours=time_window_hours)

    whales_in_window = [t for t in transactions if t.timestamp <= window_end]

    if len(whales_in_window) < 3:
        return None

    total_volume = sum(t.amountUsd for t in whales_in_window)
    whale_count = len(set(t.walletAddress for t in whales_in_window))

    # Calculate confidence (same logic as accumulation)
    confidence_scores = []
    for tx in whales_in_window:
        whale_weight = calculate_whale_weight(tx.walletRank, tx.portfolioValue)
        size_factor = min(tx.amountUsd / 1_000_000, 1.0)
        confidence = whale_weight * 0.7 + size_factor * 0.3
        confidence_scores.append(confidence)

    avg_confidence = sum(confidence_scores) / len(confidence_scores)

    # Determine recommendation (inverse of accumulation)
    if avg_confidence >= 0.8:
        recommendation = Recommendation.STRONG_SELL
    elif avg_confidence >= 0.6:
        recommendation = Recommendation.SELL
    else:
        recommendation = Recommendation.HOLD

    top_whale_ranks = sorted([t.walletRank for t in whales_in_window])[:3]
    reasoning = f"{whale_count} whales distributed ${total_volume:,.0f} in {time_window_hours}h. Top participants: ranks {top_whale_ranks}. Confidence: {avg_confidence:.2%}"

    return WhaleSignal(
        tokenAddress=transactions[0].tokenAddress,
        chainId=1,
        signalType=SignalType.DISTRIBUTION,
        whaleCount=whale_count,
        totalVolumeUsd=total_volume,
        avgConfidence=avg_confidence,
        recommendation=recommendation,
        targetPriceUsd=None,
        stopLossUsd=None,
        reasoning=reasoning,
        detectedAt=datetime.now(),
        windowStart=window_start,
        windowEnd=window_end,
    )


def analyze_whale_activity(
    buy_transactions: List[WhaleTransaction],
    sell_transactions: List[WhaleTransaction],
    time_window_hours: int = 24,
) -> Optional[WhaleSignal]:
    """
    Analyze whale activity for a specific token.

    Checks for both accumulation and distribution patterns.
    Returns the strongest signal detected.

    Args:
        buy_transactions: List of whale buy transactions
        sell_transactions: List of whale sell transactions
        time_window_hours: Time window for pattern detection

    Returns:
        WhaleSignal if significant pattern detected, None otherwise
    """
    # Check for accumulation
    accumulation_signal = detect_accumulation_pattern(
        buy_transactions, time_window_hours
    )

    # Check for distribution
    distribution_signal = detect_distribution_pattern(
        sell_transactions, time_window_hours
    )

    # Return signal with higher confidence
    if accumulation_signal and distribution_signal:
        return (
            accumulation_signal
            if accumulation_signal.avgConfidence > distribution_signal.avgConfidence
            else distribution_signal
        )
    elif accumulation_signal:
        return accumulation_signal
    elif distribution_signal:
        return distribution_signal
    else:
        return None
