import pathlib
from setuptools import setup, Command

version_path = pathlib.Path(pathlib.Path(__file__).resolve().parent, 'VERSION')
VERSION = version_path.read_text(encoding='utf-8').strip()
class Version(Command):
    user_options = []

    def initialize_options(self):
        pass

    def finalize_options(self):
        pass

    def run(self):
        print(VERSION)

setup(
    name='firex_flame_ui',
    # A built UI workspace is always dirty, since build artifacts are inside the git repo.
    # It's therefore necessary to treat the first dirty commit as a clean tag.
    version=VERSION,
    cmdclass={
        'version': Version,
    },
    description='UI for FireX.',
    url='https://github.com/FireXStuff/firex-flame-ui',
    author='Core FireX Team',
    author_email='firex-dev@gmail.com',
    license='BSD-3-Clause',
    packages=['firex_flame_ui'],
    # 'npm run build' is configured to put build artifacts & files in this 'public' folder in the 'dist' directory.
    # Therefore, at python packaging time, both python files & UI build artifacts are in the same (current) directory.
    package_dir={'firex_flame_ui': './'},
    zip_safe=True,
    include_package_data=True,
    package_data={
        # Files available to consumers of this python package (UI build artifacts).
        # NOTE: these expressions must also be present in MANIFEST.in
        'firex_flame_ui': ['*.html', 'assets/*', 'COMMITHASH'],
    },
    entry_points={},
)
