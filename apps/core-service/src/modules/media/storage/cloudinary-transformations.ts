import { v2 as cloudinary } from 'cloudinary';
import type { CloudinaryOptions } from './cloudinary.storage';
import { unwrapCloudinaryError } from './describe-error';

export type TransformationSync = {
  created: string[];
  allowed: string[];
};

type AdminApi = {
  transformation(
    name: string,
    options: Record<string, unknown>,
  ): Promise<unknown>;
  create_transformation(
    name: string,
    definition: string,
    options: Record<string, unknown>,
  ): Promise<unknown>;
  update_transformation(
    name: string,
    updates: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<unknown>;
};

const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  const cause = unwrapCloudinaryError(error);
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'http_code' in cause &&
    cause.http_code === NOT_FOUND
  );
}

export async function syncNamedTransformations(
  options: CloudinaryOptions,
  definitions: Readonly<Record<string, string>>,
  api: AdminApi = cloudinary.api as unknown as AdminApi,
): Promise<TransformationSync> {
  const credentials = {
    cloud_name: options.cloudName,
    api_key: options.apiKey,
    api_secret: options.apiSecret,
  };
  const result: TransformationSync = { created: [], allowed: [] };
  for (const [name, definition] of Object.entries(definitions)) {
    try {
      await api.transformation(name, credentials);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      await api.create_transformation(name, definition, credentials);
      result.created.push(name);
    }
    await api.update_transformation(
      name,
      { allowed_for_strict: true },
      credentials,
    );
    result.allowed.push(name);
  }
  return result;
}
