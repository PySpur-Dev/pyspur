import { Button, ButtonProps } from '@nextui-org/react';

export interface NodeButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export const NodeButton: React.FC<NodeButtonProps> = ({
  variant = 'primary',
  ...props
}) => {
  return <Button {...props} />;
};
