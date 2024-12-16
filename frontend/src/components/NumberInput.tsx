import React from 'react';
import { Input } from "@nextui-org/react";

interface NumberInputProps {
  label: string;
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, onChange, disabled }) => (
  <div className="my-4">
    <Input
      type="number"
      label={label}
      value={value.toString()}
      onChange={onChange}
      disabled={disabled}
      fullWidth
    />
  </div>
);

export default NumberInput;
