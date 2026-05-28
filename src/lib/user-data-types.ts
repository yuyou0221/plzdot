export type UserDataMetricTone = "neutral" | "info" | "warning" | "success";

export type UserDataMetric = {
  label: string;
  value: number;
  helper: string;
  tone: UserDataMetricTone;
};

export type UserDataPerson = {
  id: string;
  name: string;
  teamId?: string;
  teamName: string;
  departmentTeamId?: string;
  departmentTeamName: string;
  projectGroupTeamId?: string;
  projectGroupTeamName: string;
  roleTitle: string;
  businessRoles: string[];
  userType: string;
  loginName: string;
  authRole: string;
  authRoleLabel: string;
  permissionLevel?: number;
  permissionLevelLabel: string;
  canLogin: boolean;
  isModeler: boolean;
  weeklyCapacityStyles?: number;
  weeklyAvailableWorkdays?: number;
  isSchedulable: boolean;
  status: string;
  notes: string;
  specialtyTags: string[];
  weaknessTags: string[];
  missingCapacity: boolean;
};

export type UserDataTeam = {
  id: string;
  name: string;
  teamType: string;
  parentTeamId?: string;
  parentTeamName: string;
  leaderUserId?: string;
  leaderName: string;
  status: string;
  notes: string;
};

export type UserDataVendor = {
  id: string;
  name: string;
  vendorType: string;
  contactName: string;
  contactInfo: string;
  specialtyTags: string[];
  stableCapacity: boolean;
  status: string;
  notes: string;
};

export type UserAvailabilityBlock = {
  id: string;
  userId: string;
  userName: string;
  blockType: string;
  startDate: string;
  endDate: string;
  workdayCount?: number;
  status: string;
  notes: string;
};

export type UserDataViewerPolicy = {
  permissionLevel: number;
  permissionLevelLabel: string;
  isLevelZero: boolean;
  isHumanResources: boolean;
  canSeeSensitiveUserFields: boolean;
  canImportExcel: boolean;
  canExportPasswords: boolean;
  canDeleteDisabledUsers: boolean;
};

export type UserDataFieldVisibility = {
  scope: string;
  field: string;
  levelZero: string;
  humanResources: string;
  moduleRead: string;
};

export type UserDataModuleReadModel = {
  moduleName: string;
  readableFields: string;
  hiddenFields: string;
  notes: string;
};

export type UserDataModuleReadSnapshot = {
  moduleName: string;
  recordName: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  notes: string;
};

export type UserDataWorkbenchData = {
  sourceLabel: string;
  generatedAt: string;
  viewer: UserDataViewerPolicy;
  fieldVisibility: UserDataFieldVisibility[];
  moduleReadModels: UserDataModuleReadModel[];
  moduleReadSnapshots: UserDataModuleReadSnapshot[];
  metrics: UserDataMetric[];
  people: UserDataPerson[];
  teams: UserDataTeam[];
  vendors: UserDataVendor[];
  availabilityBlocks: UserAvailabilityBlock[];
};
