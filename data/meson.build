desktop_file = i18n.merge_file(
  input: app_id + '.desktop.in',
  output: app_id + '.desktop',
  type: 'desktop',
  po_dir: '../po',
  install: true,
  install_dir: datadir / 'applications',
)

desktop_utils = find_program('desktop-file-validate', required: false)
if desktop_utils.found()
  test('Validate desktop file', desktop_utils, args: [desktop_file])
endif

metainfo_file = i18n.merge_file(
  input: app_id + '.metainfo.xml.in',
  output: app_id + '.metainfo.xml',
  po_dir: '../po',
  install: true,
  install_dir: datadir / 'metainfo',
)

appstreamcli = find_program('appstreamcli', required: false, disabler: true)
test('Validate appstream file', appstreamcli,
  args: ['validate', '--no-net', '--explain', metainfo_file])

install_data(app_id + '.gschema.xml', install_dir: datadir / 'glib-2.0' / 'schemas')

compile_schemas = find_program('glib-compile-schemas', required: false, disabler: true)
test('Validate schema file', compile_schemas,
  args: ['--strict', '--dry-run', meson.current_source_dir()])

# Compiled into the build tree too, so `meson devenv` can run the app against
# the schema without installing anything.
gnome.compile_schemas(depend_files: files(app_id + '.gschema.xml'))

# Everything the UI loads at runtime that is not code: templates, the
# stylesheet, the symbolic icons and the bundled recording.
gnome.compile_resources(app_id + '.data',
  app_id + '.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

service_conf = configuration_data()
service_conf.set('bindir', bindir)
service_conf.set('app_id', app_id)
configure_file(
  input: app_id + '.service.in',
  output: app_id + '.service',
  configuration: service_conf,
  install: true,
  install_dir: datadir / 'dbus-1' / 'services',
)

subdir('icons')
