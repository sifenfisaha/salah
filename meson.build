project('salah',
  version: '1.0.1',
  meson_version: '>= 1.0.0',
  license: 'MIT',
)

gnome = import('gnome')
i18n = import('i18n')

app_id = 'io.github.sifenfisaha.Salah'

# gjs is the only hard build requirement; the libraries below are runtime
# needs, checked here so a missing one is reported by meson rather than as a
# stack trace on first launch.
gjs_dep = dependency('gjs-1.0', version: '>= 1.76')
gjs_console = gjs_dep.get_variable(pkgconfig: 'gjs_console')
dependency('gtk4', version: '>= 4.14')
dependency('libadwaita-1', version: '>= 1.8')
dependency('gstreamer-1.0', version: '>= 1.20')
dependency('libsoup-3.0')
# The location and background portals. Optional: without them the app still
# runs, it only loses "Use system location" and asks for autostart itself.
dependency('libportal', required: false)

prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')
libdir = prefix / get_option('libdir')
# gjs's package loader looks for the gresources under datadir/<app id>.
pkgdatadir = datadir / app_id

subdir('data')
subdir('src')
subdir('po')

# `meson devenv -C _build io.github.sifenfisaha.Salah` runs the app straight
# from the build tree. gjs's package loader reads these two variables to find
# the gresources and the compiled schema there instead of under the prefix.
devenv = environment()
devenv.set('MESON_BUILD_ROOT', meson.project_build_root())
devenv.set('MESON_SOURCE_ROOT', meson.project_source_root())
devenv.prepend('PATH', meson.project_build_root() / 'src')
meson.add_devenv(devenv)

gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
  update_desktop_database: true,
)
