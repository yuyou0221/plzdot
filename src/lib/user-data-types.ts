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
  roleTitle: string;
  userType: string;
  isModeler: boolean;
  weeklyCapacityStyles?: number;
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
  contactName: string;
  contactInfo: string;
  specialtyTags: string[];
  stableCapacity: boolean;
  status: string;
  notes: string;
};

export type UserDataWorkbenchData = {
  sourceLabel: string;
  generatedAt: string;
  metrics: UserDataMetric[];
  people: UserDataPerson[];
  teams: UserDataTeam[];
  vendors: UserDataVendor[];
};
