'use client';

import { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalculatorNumpadProps {
  initialAmount: number;
  symbol: string;
  onChange: (amount: number) => void;
}

type Operator = '+' | '-' | '×' | '÷' | null;

export function CalculatorNumpad({ initialAmount, symbol, onChange }: CalculatorNumpadProps) {
  const [display, setDisplay] = useState(initialAmount > 0 ? String(initialAmount) : '');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);

  const compute = useCallback((a: number, b: number, op: Operator): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  }, []);

  const emitValue = useCallback(
    (val: number) => onChange(Math.round(val * 100) / 100),
    [onChange]
  );

  const inputDigit = (digit: string) => {
    if (justEvaluated) {
      const fresh = digit === '.' ? '0.' : digit;
      setDisplay(fresh);
      setJustEvaluated(false);
      emitValue(parseFloat(fresh) || 0);
      return;
    }
    if (digit === '.') {
      if (display.includes('.')) return;
      const next = display === '' ? '0.' : display + '.';
      setDisplay(next);
      emitValue(parseFloat(next) || 0);
      return;
    }
    const newDisplay = display === '0' ? digit : display + digit;
    if (newDisplay.replace('.', '').length > 12) return;
    setDisplay(newDisplay);
    emitValue(parseFloat(newDisplay) || 0);
  };

  const inputOperator = (op: Operator) => {
    if (display === '' && storedValue !== null) {
      setOperator(op);
      return;
    }
    if (storedValue !== null && operator && display !== '') {
      const result = compute(storedValue, parseFloat(display) || 0, operator);
      const rounded = Math.round(result * 100) / 100;
      setStoredValue(rounded);
      emitValue(rounded);
    } else {
      setStoredValue(parseFloat(display) || 0);
    }
    setOperator(op);
    setJustEvaluated(false);
    setDisplay('');
  };

  const evaluate = () => {
    if (storedValue === null || !operator || display === '') return;
    const result = compute(storedValue, parseFloat(display) || 0, operator);
    const rounded = Math.round(result * 100) / 100;
    setDisplay(String(rounded));
    setStoredValue(null);
    setOperator(null);
    setJustEvaluated(true);
    emitValue(rounded);
  };

  const clearAll = () => {
    setDisplay('');
    setStoredValue(null);
    setOperator(null);
    setJustEvaluated(false);
    emitValue(0);
  };

  const deleteLast = () => {
    if (justEvaluated) {
      clearAll();
      return;
    }
    const newDisplay = display.slice(0, -1);
    setDisplay(newDisplay);
    emitValue(parseFloat(newDisplay) || 0);
  };

  const formatDisplay = (val: string) => {
    if (!val) return '0';
    if (val === '.') return '0.';
    const [int, dec] = val.split('.');
    const intPart = int === '' ? '0' : parseInt(int, 10).toLocaleString('en-US');
    return dec !== undefined ? `${intPart}.${dec}` : intPart;
  };

  const keys: {
    label: string;
    action: () => void;
    type: 'num' | 'op' | 'fn';
    span?: string;
    active?: boolean;
  }[] = [
    { label: 'AC', action: clearAll, type: 'fn' },
    { label: '÷', action: () => inputOperator('÷'), type: 'op', active: operator === '÷' },
    { label: '×', action: () => inputOperator('×'), type: 'op', active: operator === '×' },
    { label: '⌫', action: deleteLast, type: 'fn' },
    { label: '7', action: () => inputDigit('7'), type: 'num' },
    { label: '8', action: () => inputDigit('8'), type: 'num' },
    { label: '9', action: () => inputDigit('9'), type: 'num' },
    { label: '-', action: () => inputOperator('-'), type: 'op', active: operator === '-' },
    { label: '4', action: () => inputDigit('4'), type: 'num' },
    { label: '5', action: () => inputDigit('5'), type: 'num' },
    { label: '6', action: () => inputDigit('6'), type: 'num' },
    { label: '+', action: () => inputOperator('+'), type: 'op', active: operator === '+' },
    { label: '1', action: () => inputDigit('1'), type: 'num' },
    { label: '2', action: () => inputDigit('2'), type: 'num' },
    { label: '3', action: () => inputDigit('3'), type: 'num' },
    { label: '=', action: evaluate, type: 'op', span: 'row-span-2' },
    { label: '0', action: () => inputDigit('0'), type: 'num', span: 'col-span-2' },
    { label: '.', action: () => inputDigit('.'), type: 'num' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-end gap-1 px-3 py-2 rounded-2xl bg-muted/50">
        {operator && storedValue !== null && (
          <span className="text-muted-foreground text-xs">
            {Math.round(storedValue * 100) / 100} {operator}
          </span>
        )}
        <span className="text-xl font-bold tabular-nums truncate">
          {symbol}
          {formatDisplay(display)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {keys.map((key, i) => (
          <button
            key={i}
            type="button"
            onClick={key.action}
            className={cn(
              'h-12 rounded-2xl flex items-center justify-center text-lg font-semibold transition-all touch-manipulation active:scale-95',
              key.span,
              key.type === 'num' && 'bg-muted/60 hover:bg-muted text-foreground',
              key.type === 'op' &&
                'bg-primary/10 hover:bg-primary/20 text-primary font-bold',
              key.type === 'fn' &&
                'bg-muted/40 hover:bg-muted/60 text-muted-foreground text-base',
              key.active && 'bg-primary text-primary-foreground hover:bg-primary'
            )}
          >
            {key.label === '⌫' ? <Delete className="h-5 w-5" /> : key.label}
          </button>
        ))}
      </div>
    </div>
  );
}