import registryJson from "../../config/templates.json";

type TemplateRegistry = typeof registryJson;

export const templateRegistry: TemplateRegistry = registryJson;

export const getFamilyPreviewWorkspaceId = (familyId: string): string => {
  return `preview-active-${familyId.replace(/[._]/g, "-")}`;
};
