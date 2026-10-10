'use client';

import {
  UtensilsCrossed, ShoppingCart, Utensils, Bike, Car, Fuel, CarTaxiFront,
  ShoppingBag, Shirt, Smartphone, Home, KeyRound, Plug, Wifi, Clapperboard,
  Film, Music, Gamepad2, HeartPulse, Dumbbell, Pill, GraduationCap, BookOpen,
  Plane, BedDouble, Gift, Repeat, Sparkles, MoreHorizontal, Banknote,
  Building2, CreditCard, PiggyBank, Wallet, Laptop, TrendingUp, RotateCcw,
  Coffee, Briefcase, DollarSign, PiggyBank as SavingsIcon, Landmark,
  Target, Coins, Receipt, Zap, type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed, ShoppingCart, Utensils, Bike, Car, Fuel, CarTaxiFront,
  ShoppingBag, Shirt, Smartphone, Home, KeyRound, Plug, Wifi, Clapperboard,
  Film, Music, Gamepad2, HeartPulse, Dumbbell, Pill, GraduationCap, BookOpen,
  Plane, BedDouble, Gift, Repeat, Sparkles, MoreHorizontal, Banknote,
  Building2, CreditCard, PiggyBank, Wallet, Laptop, TrendingUp, RotateCcw,
  Coffee, Briefcase, DollarSign, SavingsIcon, Landmark, Target, Coins,
  Receipt, Zap,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export const CATEGORY_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#DDA0DD', '#FFB347',
  '#96CEB4', '#FF8E72', '#6C5CE7', '#A8DADC', '#FF6B9D',
  '#22C55E', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#06B6D4',
  '#94A3B8', '#E11D48', '#7C3AED', '#0891B2', '#CA8A04',
];

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? MoreHorizontal;
}

interface IconProps {
  name: string;
  className?: string;
  size?: number;
}

export function CategoryIcon({ name, className, size }: IconProps) {
  const Icon = getIcon(name);
  return <Icon className={className} size={size} />;
}
