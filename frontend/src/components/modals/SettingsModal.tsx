"use client";

import type { CardProps, SwitchProps } from "@nextui-org/react";
import React, { useState, useEffect } from "react";
import {
  Card,
  CardBody,
  CardFooter,
  Tabs,
  Tab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  useDisclosure,
  Input,
  extendVariants,
  Switch,
  cn,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { listApiKeys, setApiKey, getApiKey } from "../../utils/api";
import { useTheme } from "next-themes";
import { ApiKey } from "../../types/workflow";

// CellWrapper Component
const CellWrapper = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-2 rounded-medium bg-content2 p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

CellWrapper.displayName = "CellWrapper";

// CustomSwitch Component
const CustomSwitch = extendVariants(Switch, {
  variants: {
    color: {
      foreground: {
        wrapper: [
          "group-data-[selected=true]:bg-foreground",
          "group-data-[selected=true]:text-background",
        ],
      },
    },
  },
});

// SwitchCell Component
type SwitchCellProps = Omit<SwitchProps, "color"> & {
  label: string;
  description: string;
  color?: SwitchProps["color"] | "foreground";
  classNames?: SwitchProps["classNames"] & {
    description?: string | string[];
  };
};

const SwitchCell = React.forwardRef<HTMLInputElement, SwitchCellProps>(
  ({ label, description, classNames, ...props }, ref) => (
    <CustomSwitch
      ref={ref}
      classNames={{
        ...classNames,
        base: cn(
          "inline-flex bg-content2 flex-row-reverse w-full max-w-full items-center",
          "justify-between cursor-pointer rounded-medium gap-2 p-4",
          classNames?.base,
        ),
      }}
      {...props}
    >
      <div className="flex flex-col">
        <p className={cn("text-medium", classNames?.label)}>{label}</p>
        <p className={cn("text-small text-default-500", classNames?.description)}>{description}</p>
      </div>
    </CustomSwitch>
  ),
);

SwitchCell.displayName = "SwitchCell";

// APIKeys Component
function APIKeys(props: CardProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [originalKeys, setOriginalKeys] = useState<ApiKey[]>([]);

  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const keys = await listApiKeys();
        const keyValues = await Promise.all(
          keys.map(async (apiKey) => {
            const value = await getApiKey(apiKey.name);
            return {
              name: apiKey.name,
              value: value?.value || ''
            } as ApiKey;
          })
        );

        setKeys(keyValues);
        setOriginalKeys(keyValues);
      } catch (error) {
        console.error("Error fetching API keys:", error);
      }
    };

    fetchApiKeys();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setKeys((prevKeys) =>
      prevKeys.map((key) =>
        key.name === name ? { ...key, value: value } : key
      )
    );
  };

  const saveApiKeys = async () => {
    try {
      await Promise.all(
        keys.map(({ name, value }) => setApiKey(name, value))
      );
      setOriginalKeys(keys);
      console.log("API Keys saved:", keys);
    } catch (error) {
      console.error("Error saving API keys:", error);
    }
  };

  const hasChanges = () => {
    return keys.some((key, index) => key.value !== originalKeys[index].value);
  };

  return (
    <Card className="max-w-xl p-2" {...props}>
      <CardBody className="grid grid-cols-1 gap-4">
        {keys.map(({ name, value }) => (
          <Input
            key={name}
            label={name}
            labelPlacement="outside"
            placeholder={`Enter value`}
            name={name}
            value={value}
            onFocus={() => setKeys((prevKeys) =>
              prevKeys.map((key) =>
                key.name === name ? { ...key, value: '' } : key
              )
            )}
            onChange={handleInputChange}
          />
        ))}
      </CardBody>
      {hasChanges() && (
        <CardFooter className="flex justify-between">
          <Button
            onPress={saveApiKeys}
            className="bg-primary text-white"
          >
            Save API Keys
          </Button>
          <Button
            onPress={() => setKeys(originalKeys)}
            className="bg-secondary text-primary"
          >
            Cancel
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// Main SettingsModal Component
export default function SettingsModal(props: CardProps) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <Button onPress={onOpen} variant="light" isIconOnly>
        <Icon className="text-default-500" icon="solar:settings-linear" width={24} />
      </Button>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Settings</ModalHeader>
              <ModalBody>
                <Card {...props}>
                  <Tabs
                    classNames={{
                      tabList: "mx-4 mt-6 text-medium",
                      tabContent: "text-small",
                    }}
                    size="lg"
                  >
                    <Tab
                      key="appearance"
                      textValue="Appearance"
                      title={
                        <div className="flex items-center gap-1.5">
                          <Icon icon="solar:palette-bold" width={20} />
                          <p>Appearance</p>
                        </div>
                      }
                    >
                      <div className="p-4">
                        <SwitchCell
                          label="Dark Mode"
                          description="Toggle between light and dark theme"
                          isSelected={theme === 'dark'}
                          onValueChange={(isSelected) => setTheme(isSelected ? 'dark' : 'light')}
                        />
                      </div>
                    </Tab>
                    <Tab
                      key="api-keys"
                      textValue="API Keys"
                      title={
                        <div className="flex items-center gap-1.5">
                          <Icon icon="solar:user-id-bold" width={20} />
                          <p>API Keys</p>
                        </div>
                      }
                    >
                      <APIKeys className="p-2 shadow-none" />
                    </Tab>
                  </Tabs>
                </Card>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
