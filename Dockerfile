FROM nginx
MAINTAINER "Annan"
COPY build /usr/share/nginx/html/build/
COPY docker/proxy.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
