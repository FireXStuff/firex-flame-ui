# Build FireX Pip Packages, Run Tests, Generate Code Coverage, and Build Docs

#!/usr/bin/env python

from subprocess import check_output, CalledProcessError, STDOUT
import os

from celery.utils.log import get_task_logger
from firexapp.engine.celery import app
from firexkit.chain import InjectArgs


logger = get_task_logger(__name__)


def execute_cmd(cmd, *args, **kwargs):
    defaults = {
        'stderr': STDOUT,
        'universal_newlines': True
    }
    # Allows overrides from input kwargs.
    kwargs = {**defaults, **kwargs}
    try:
        return check_output(cmd, *args, **kwargs)
    except CalledProcessError as e:
        logger.info(e.output)
        raise e


@app.task()
def npm_install(install_dir):
    execute_cmd(['npm', 'ci'], cwd=install_dir)


@app.task()
def npm_lint(install_dir):
    execute_cmd(['npm', 'run', 'lint'], cwd=install_dir)


@app.task()
def npm_build(install_dir):
    execute_cmd(['npm', 'run', 'build'], cwd=install_dir)


@app.task()
def npm_unit_test(install_dir):
    execute_cmd(['npm', 'run', 'test:unit'], cwd=install_dir)


@app.task()
def create_python_sdist(install_dir):
    dist_dir = os.path.join(install_dir, 'dist')
    assert os.path.isdir(dist_dir), "Expected dist dir to already exist, but it doesn't. " \
                                    "Ensure build has been performed in: %s." % install_dir
    execute_cmd('python3 setup.py sdist', cwd=dist_dir)


@app.task()
def is_ui_release(install_dir):
    try:
        execute_cmd('git describe --tags --exact-match', cwd=install_dir)
    except CalledProcessError:
        return False
    else:
        return True


@app.task()
def release_ui(install_dir):
    release_dir = os.path.join(install_dir, 'dist', '*')
    execute_cmd(['twine', 'upload', '--username', 'firexdev', release_dir], cwd=install_dir)


@app.task()
def flame_ui_ci(ui_install_dir='./', **kwargs):
    #
    #  args: ['sh', '-c',
    #       'sudo npm ci
    #       && sudo npm run build
    #       && cd dist/ && sudo python3 setup.py sdist
    #       && ! git describe --tags --exact-match
    #       || twine upload --username firexdev dist/*']
    #

    ui_ci_chain = InjectArgs(install_dir=ui_install_dir, **kwargs) \
                  | npm_install.s() \
                  | npm_lint.s() \
                  | npm_build.s() \
                  | create_python_sdist.s() \
                  | release_ui.s()

    r = ui_ci_chain.enqueue(block=True)
    print('%s' % r)
