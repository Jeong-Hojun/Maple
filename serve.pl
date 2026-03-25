#!/usr/bin/perl
use strict;
use warnings;
use HTTP::Daemon;
use HTTP::Status;
use HTTP::Response;
use File::Basename;
use Cwd 'abs_path';

my $port = $ARGV[0] || 3000;
my $root = dirname(abs_path($0));

my %mime = (
    html => 'text/html; charset=utf-8',
    css  => 'text/css',
    js   => 'application/javascript',
    json => 'application/json',
    png  => 'image/png',
    jpg  => 'image/jpeg',
    jpeg => 'image/jpeg',
    svg  => 'image/svg+xml',
    ico  => 'image/x-icon',
    txt  => 'text/plain',
);

my $d = HTTP::Daemon->new(LocalPort => $port, ReuseAddr => 1)
    or die "Cannot bind to port $port: $!\n";

print "Serving $root\n";
print "Listening on http://localhost:$port\n";
STDOUT->flush();

# One request per connection — avoids blocking on keep-alive
# while new browser connections wait in the backlog.
while (1) {
    my $c = $d->accept() or next;
    my $r = $c->get_request();
    if ($r) {
        my $path = $r->uri->path;
        $path = '/index.html' if $path eq '/';
        $path =~ s|/+|/|g;
        $path =~ s|\.\./||g;

        my $file = $root . $path;
        if (-f $file) {
            my ($ext) = $file =~ /\.(\w+)$/;
            my $type  = $mime{ lc($ext // '') } // 'application/octet-stream';
            open(my $fh, '<:raw', $file) or do {
                $c->send_error(RC_INTERNAL_SERVER_ERROR);
                $c->close(); next;
            };
            local $/;
            my $body = <$fh>;
            close($fh);
            my $res = HTTP::Response->new(RC_OK);
            $res->header('Content-Type'   => $type);
            $res->header('Content-Length' => length($body));
            $res->header('Connection'     => 'close');
            $res->content($body);
            $c->send_response($res);
        } else {
            $c->send_error(RC_NOT_FOUND);
        }
    }
    $c->close();
}
