export interface Entry {
  id: string;
  title: string;
  body: string;
  annotation: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchFilters {
  query?: string;
  tag?: string;
}

export interface CreateEntryInput {
  title: string;
  body: string;
  annotation: string;
  tags: string[];
}

export interface Summary {
  entries: Entry[];
  tags: string[];
}
