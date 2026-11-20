<?php

declare(strict_types=1);

namespace Deployer;

require 'recipe/common.php';
require 'contrib/rsync.php';

host('j87.nl')
    ->setRemoteUser('deploy')
    ->setDeployPath('/var/www/fly.j87.nl')
    ->setLabels(['stage' => 'production'])
    ->set('rsync_src', __DIR__.'/public')
    ->set('rsync_dest', '{{release_path}}/public')
    ->set('keep_releases', 3)
    ->set('ssh_multiplexing', true)
    ->setSshArguments([
        '-o ConnectTimeout=20',
        '-o ServerAliveInterval=15',
        '-o ServerAliveCountMax=4',
    ]);

add('rsync', [
    'flags' => 'rzp',
    'options' => [
        'delete',
        'chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r',
    ],
]);

set('shared_dirs', []);
set('shared_files', []);
set('writable_dirs', []);

after('deploy:failed', 'deploy:unlock');

desc('Make sure the build exists before uploading it');
task('deploy:check-build', function (): void {
    if (! is_file(__DIR__.'/public/index.html')) {
        throw error('public/index.html is missing: run npm run build first.');
    }
});

desc('Deploy the static site');
task('deploy', [
    'deploy:info',
    'deploy:check-build',
    'deploy:setup',
    'deploy:lock',
    'deploy:release',
    'rsync',
    'deploy:symlink',
    'deploy:unlock',
    'deploy:cleanup',
]);
