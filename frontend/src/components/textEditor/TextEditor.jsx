"use client";

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import ListItem from "@tiptap/extension-list-item";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, useDisclosure } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { List, ListOrdered } from "lucide-react";
import styles from "./TextEditor.module.css";

// Wrap the component with forwardRef
const TextEditor = forwardRef(({ content, setContent, isEditable, fullScreen, inputSchema = {}, fieldTitle }, ref) => {

  const editor = useEditor({
    extensions: [
      Color.configure({ types: [TextStyle.name, ListItem.name] }),
      TextStyle.configure({ types: [ListItem.name] }),
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Underline,
    ],
    content: content,
    editorProps: {
      attributes: {
        class: [
          "w-full bg-content2 hover:bg-content3 transition-colors min-h-[40px] resize-y rounded-medium px-3 py-2 text-foreground outline-none placeholder:text-foreground-500",
          isEditable ? "" : "rounded-medium",
          fullScreen ? styles.fullScreenEditor : styles.truncatedEditor
        ].filter(Boolean).join(" "), // Join classes without extra spaces
      },
    },
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editable: isEditable,
    autofocus: 'end',
    immediatelyRender: false,
    parseOptions: {
      preserveWhitespace: 'full',
    },
  });

  // Expose the insertAtCursor method to the parent component via ref
  useImperativeHandle(ref, () => ({
    insertAtCursor: (text) => {
      if (editor) {
        editor.chain().focus().insertContent(text).run();
      }
    },
  }));

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const modalEditor = useEditor({
    extensions: [
      Color.configure({ types: [TextStyle.name, ListItem.name] }),
      TextStyle.configure({ types: [ListItem.name] }),
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Underline,
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: `w-full bg-content2 hover:bg-content3 transition-colors min-h-[40vh] resize-y rounded-medium px-3 py-2 text-foreground outline-none placeholder:text-foreground-500`,
      },
    },
    onUpdate: ({ editor }) => {
      const newContent = editor.getHTML();
      if (newContent !== content) {
        setContent(newContent);
      }
    },
    editable: true,
    autofocus: false,
    immediatelyRender: false,
    parseOptions: {
      preserveWhitespace: 'full',
    },
  });

  React.useEffect(() => {
    if (modalEditor && content !== modalEditor.getHTML()) {
      modalEditor.commands.setContent(content || '');
    }
  }, [content, modalEditor]);

  React.useEffect(() => {
    return () => {
      if (modalEditor) {
        modalEditor.destroy();
      }
    };
  }, [modalEditor]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  // Add variable button rendering function
  const renderVariableButtons = (editorInstance) => {
    if (!inputSchema || Object.keys(inputSchema).length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mb-2 px-2">
        {Object.keys(inputSchema).map((variable) => (
          <Button
            key={variable}
            size="sm"
            variant="flat"
            color="primary"
            onClick={() => {
              if (editorInstance) {
                editorInstance.chain().focus().insertContent(`{{${variable}}}`).run();
              }
            }}
          >
            {variable}
          </Button>
        ))}
      </div>
    );
  };

  // Modified renderToolbar to include variable buttons
  const renderToolbar = (editorInstance, isFullScreen = false) => {
    if (!editorInstance) return null;

    const buttonSize = isFullScreen ? "sm" : "md";
    const buttonClassName = isFullScreen ? "w-4 h-4" : "w-3 h-3";
    const toolbarClassName = `px-2 py-2 rounded-t-medium flex flex-col gap-2 w-full bg-content2 border-b border-divider`;

    return (
      <div className={toolbarClassName}>
        <div className="flex justify-start items-center gap-1 w-full lg:w-10/12 flex-wrap">
          <Button
            onPress={() => editorInstance.chain().focus().toggleBold().run()}
            disabled={!editorInstance.can().chain().focus().toggleBold().run()}
            color="primary"
            variant={editorInstance.isActive("bold") ? "solid" : "flat"}
            size={buttonSize}
            auto
            isIconOnly
          >
            <Icon icon="solar:text-bold-linear" className={buttonClassName} />
          </Button>
          <Button
            onPress={() => editorInstance.chain().focus().toggleItalic().run()}
            disabled={!editorInstance.can().chain().focus().toggleItalic().run()}
            color="primary"
            variant={editorInstance.isActive("italic") ? "solid" : "flat"}
            size={buttonSize}
            auto
            isIconOnly
          >
            <Icon icon="solar:text-italic-linear" className={buttonClassName} />
          </Button>
          <Button
            onPress={() => editorInstance.chain().focus().toggleUnderline().run()}
            disabled={!editorInstance.can().chain().focus().toggleUnderline().run()}
            color="primary"
            variant={editorInstance.isActive("underline") ? "solid" : "flat"}
            size={buttonSize}
            auto
            isIconOnly
          >
            <Icon icon="solar:text-underline-linear" className={buttonClassName} />
          </Button>
          <Button
            onPress={() => editorInstance.chain().focus().toggleBulletList().run()}
            color="primary"
            variant={editorInstance.isActive("bulletList") ? "solid" : "flat"}
            size={buttonSize}
            auto
            isIconOnly
          >
            <List className={buttonClassName} />
          </Button>
          <Button
            onPress={() => editorInstance.chain().focus().toggleOrderedList().run()}
            color="primary"
            variant={editorInstance.isActive("orderedList") ? "solid" : "flat"}
            size={buttonSize}
            auto
            isIconOnly
          >
            <ListOrdered className={buttonClassName} />
          </Button>
        </div>
        {renderVariableButtons(editorInstance)}
      </div>
    );
  };

  // Add this new function to handle cancellation
  const handleCancel = (onClose) => {
    modalEditor.commands.setContent(content || '');
    onClose();
  };

  // Add this function to handle saving
  const handleSave = (onClose) => {
    setContent(modalEditor.getHTML());
    onClose();
  };

  return (
    <div>
      {/* Render the field title if it exists */}
      {fieldTitle && (
        <div className="flex justify-between items-center mb-2 ml-2 font-semibold">
          <span>{fieldTitle}</span>
          {!fullScreen && (
            <Button onPress={onOpen} isIconOnly >
              <Icon icon="solar:full-screen-linear" className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {isEditable && renderToolbar(editor)}
      <div className={styles.tiptap}>
        <EditorContent editor={editor} />
      </div>

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="5xl"
        scrollBehavior="inside"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Prompt Editor</ModalHeader>
              <ModalBody>
                <div>
                  {renderToolbar(modalEditor, true)}
                  <div className={styles.tiptap}>
                    <EditorContent editor={modalEditor} />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => handleCancel(onClose)}>
                  Cancel
                </Button>
                <Button color="primary" onPress={() => handleSave(onClose)}>
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
});

export default TextEditor;