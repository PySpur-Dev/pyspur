import React, { memo } from 'react';
import ZoomInOut from './ZoomInOut';
import { MiniMap } from '@xyflow/react';
import { Button, ButtonGroup } from '@nextui-org/react';
import { useModeStore } from '../../../store/modeStore';
import { Icon } from "@iconify/react";
import TipPopup from './TipPopUp';

interface OperatorProps {
  handleLayout: () => void;
}

function Operator({ handleLayout }: OperatorProps) {
  const mode = useModeStore((state) => state.mode);
  const setMode = useModeStore((state) => state.setMode);

  return (
    <>
      <MiniMap
        style={{
          width: 102,
          height: 72,
        }}
        className='!absolute !left-4 !bottom-14 z-[9] !m-0 !w-[102px] !h-[72px] !border-[0.5px] !border-default-200 !rounded-lg !shadow-lg'
      />
      <div className='flex items-center mt-1 gap-2 absolute left-4 bottom-4 z-[9]'>
        <ZoomInOut />
        <ButtonGroup>
          <TipPopup title='Select' shortcuts={['v']}>
            <Button
              size="sm"
              isIconOnly
              onClick={() => setMode('pointer' as any)}
              className='bg-background'
            >
              <Icon
                className={`${mode === 'pointer' as any ? 'text-foreground' : 'text-default-600'}`}
                icon={mode === 'pointer' as any ? "solar:cursor-bold" : "solar:cursor-linear"}
                width={16}
              />
            </Button>
          </TipPopup>
          <TipPopup title='Pan' shortcuts={['space']}>
            <Button
              size="sm"
              isIconOnly
              onClick={() => setMode('hand')}
              className='bg-background'
            >
              <Icon
                className={`${mode === 'hand' ? 'text-foreground' : 'text-default-600'}`}
                icon={mode === 'hand' ? "solar:hand-shake-bold" : "solar:hand-shake-linear"}
                width={16}
              />
            </Button>
          </TipPopup>
          <TipPopup title='Layout Nodes'>
            <Button
              size="sm"
              isIconOnly
              onClick={handleLayout}
              className='bg-background'
            >
              <Icon
                className="text-default-600"
                icon="solar:ruler-angular-linear"
                width={16}
              />
            </Button>
          </TipPopup>
        </ButtonGroup>
        <ButtonGroup>
          <Button onClick={() => {}} className="bg-default-100">Undo</Button>
          <Button onClick={() => {}} className="bg-default-100">Redo</Button>
        </ButtonGroup>
      </div>
    </>
  );
}

export default memo(Operator);
