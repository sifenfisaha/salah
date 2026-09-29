gnome.compile_resources(app_id + '.src',
  app_id + '.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', gjs_console)
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', app_id)
bin_conf.set('prefix', prefix)
bin_conf.set('libdir', libdir)
bin_conf.set('datadir', datadir)

configure_file(
  input: app_id + '.in',
  output: app_id,
  configuration: bin_conf,
  install: true,
  install_dir: bindir,
  install_mode: 'rwxr-xr-x',
)

# configure_file cannot mark its output executable, and `meson devenv` runs
# the launcher straight from the build tree.
run_command('chmod', '+x', meson.current_build_dir() / app_id, check: false)

# The engine is plain ES modules with no GNOME imports, so node can test it
# directly. Wired in here so `meson test` runs everything a contributor should.
node = find_program('node', required: false)
if node.found()
  test('Engine', node,
    args: ['--test', 'test/**/*.test.js'],
    workdir: meson.project_source_root(),
  )
endif
