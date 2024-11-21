import React, { memo } from 'react';
import ZoomInOut from './ZoomInOut';
import AddNodePopoverFooter from './AddNodePopoverFooter';
import { MiniMap } from '@xyflow/react';
import UndoRedo from '../../../UndoRedo';
import { Button, ButtonGroup } from '@nextui-org/react';
import { useSelector, useDispatch } from 'react-redux';
import { useModeStore } from '../../../../store/modeStore';
import { Icon } from "@iconify/react";
import TipPopup from '../../../TipPopUp';
import { resetWorkflow } from '../../../../utils/api';
import { resetFlow } from '../../../../store/flowSlice';

function Operator({handleLayout}) {
  const dispatch = useDispatch();
  const nodes = useSelector(state => state.flow.nodes);
  const mode = useModeStore((state) => state.mode);
  const setMode = useModeStore((state) => state.setMode);
  const workflowID = useSelector(state => state.flow.workflowID);

  const handleClearCanvas = async () => {
    if (window.confirm('Are you sure you want to clear the canvas? This action cannot be undone.')) {
      try {
        const newWorkflow = await resetWorkflow(workflowID);
        dispatch(resetFlow(newWorkflow));
      } catch (error) {
        console.error('Error resetting workflow:', error);
      }
    }
  };

  return (
    <>
      <MiniMap
        style={{
          width: 102,
          height: 72,
        }}
        className='!absolute !left-4 !bottom-14 z-[9] !m-0 !w-[102px] !h-[72px] !border-[0.5px] !border-black/8 !rounded-lg !shadow-lg'
      />
      <div className='flex items-center mt-1 gap-2 absolute left-4 bottom-4 z-[9]'>
        <ZoomInOut />
        <ButtonGroup>
          <TipPopup title='Select' shortcuts={['v']}>
            <Button
              size="sm"
              isIconOnly
              onClick={() => setMode('pointer')}
              className={mode === 'pointer' ? 'bg-default-200' : 'bg-white'}
            >
              <Icon
                className={`${mode === 'pointer' ? 'text-default-800' : 'text-default-500'}`}
                icon={mode === 'pointer' ? "solar:cursor-bold" : "solar:cursor-linear"}
                width={16}
              />
            </Button>
          </TipPopup>
          <TipPopup title='Pan' shortcuts={['space']}>
            <Button
              size="sm"
              isIconOnly
              onClick={() => setMode('hand')}
              className={mode === 'hand' ? 'bg-default-200' : 'bg-white'}
            >
              <Icon
                className={`${mode === 'hand' ? 'text-default-800' : 'text-default-500'}`}
                icon={mode === 'hand' ? "solar:hand-shake-bold" : "solar:hand-shake-linear"}
                width={16}
              />
            </Button>
          </TipPopup>
          <UndoRedo handleUndo={null} handleRedo={null} />
          <TipPopup title='Clear Canvas'>
            <Button
              size="sm"
              isIconOnly
              onClick={handleClearCanvas}
              className='bg-white'
            >
              <Icon
                className="text-default-500"
                icon="solar:trash-bin-trash-linear"
                width={16}
              />
            </Button>
          </TipPopup>
          <TipPopup title='Layout Nodes'>
            <Button
              size="sm"
              isIconOnly
              onClick={handleLayout}
              className='bg-white'
            >
              <Icon
                className="text-default-500"
                icon="solar:ruler-angular-linear"
                width={16}
              />
            </Button>
          </TipPopup>
          <AddNodePopoverFooter />
        </ButtonGroup>
      </div>
    </>
  );
}

export default memo(Operator);