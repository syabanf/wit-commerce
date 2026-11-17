-- The file name an image had on the uploader's device, so the media library can search by it.
alter table media add column name text not null default '';
