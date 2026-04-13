import { useCallback, useDebugValue, useState } from "react";
import type { ProductTemplate } from "@/types/productTemplate";

interface UseTemplateModalStateParams {
  selectedTemplate: ProductTemplate | null;
  setSelectedTemplate: React.Dispatch<React.SetStateAction<ProductTemplate | null>>;
}

export function useTemplateModalState({
  selectedTemplate,
  setSelectedTemplate,
}: UseTemplateModalStateParams) {
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [, setTemplateRefreshNonce] = useState(0);

  useDebugValue({
    galleryOpen: showTemplateGallery,
    createOpen: showCreateForm,
    editingTemplateId: editingTemplate?.id ?? null,
    selectedTemplateId: selectedTemplate?.id ?? null,
  });

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const closeTemplateGallery = useCallback(() => {
    setShowTemplateGallery(false);
    setShowCreateForm(false);
    setEditingTemplate(null);
  }, []);

  const openTemplateGallery = useCallback(() => {
    setEditingTemplate(null);
    setShowCreateForm(false);
    setShowTemplateGallery(true);
  }, []);

  const openCreateTemplate = useCallback(() => {
    setEditingTemplate(null);
    setShowTemplateGallery(true);
    setShowCreateForm(true);
  }, []);

  const handleEditTemplate = useCallback((template: ProductTemplate) => {
    setEditingTemplate(template);
    setShowTemplateGallery(true);
    setShowCreateForm(true);
  }, []);

  const handleDeleteTemplate = useCallback((id: string) => {
    setTemplateRefreshNonce((n) => n + 1);
    if (selectedTemplate?.id === id) {
      setSelectedTemplate(null);
    }
    showToast("Template deleted");
  }, [selectedTemplate, setSelectedTemplate, showToast]);

  const cancelCreateTemplate = useCallback(() => {
    setShowCreateForm(false);
    setEditingTemplate(null);
  }, []);

  return {
    showTemplateGallery,
    showCreateForm,
    editingTemplate,
    toastMessage,
    setShowTemplateGallery,
    setShowCreateForm,
    setEditingTemplate,
    setToastMessage,
    openTemplateGallery,
    closeTemplateGallery,
    openCreateTemplate,
    handleEditTemplate,
    handleDeleteTemplate,
    cancelCreateTemplate,
    showToast,
  };
}
